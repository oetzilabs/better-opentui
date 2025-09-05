import { Array as Arr, Effect, Order, pipe, Ref } from "effect";
import Fuse, { type FuseOptionKey, type IFuseOptions } from "fuse.js";

export interface GenericCollection<T> {
  getItems: () => Effect.Effect<T[], never, never>;
  setItems: (newItems: T[]) => Effect.Effect<void, never, never>;
  addItem: (item: T) => Effect.Effect<void, never, never>;
  removeItem: (item: T) => Effect.Effect<void, never, never>;
  clearItems: () => Effect.Effect<void, never, never>;
  addSort: (...args: Sorting<T>[]) => Effect.Effect<void, never, never>;
  resetSort: (...args: Sorting<T>[]) => Effect.Effect<void, never, never>;
  removeSort: (...args: Sorting<T>[]) => Effect.Effect<void, never, never>;
  onUpdate: () => Effect.Effect<void, never, never>;
  updateSortDirection: (id: string, direction: "asc" | "desc") => Effect.Effect<void, never, never>;
  getDisplayKey: () => Effect.Effect<keyof T | undefined, never, never>;
  setFilterKeys: (keys: FuseOptionKey<T>[]) => Effect.Effect<void, never, never>;
  filter: (search: string) => Effect.Effect<T[], never, never>;
}

type OrderFor<T> = T extends string
  ? Order.Order<string>
  : T extends number
    ? Order.Order<number>
    : T extends boolean
      ? Order.Order<boolean>
      : T extends bigint
        ? Order.Order<bigint>
        : never;

export interface Sorting<T> {
  id: string;
  key: keyof T;
  direction: "asc" | "desc";
  fn: OrderFor<T[this["key"]]>;
}

const getFirstKey = Effect.fn(function* <T extends object>(items: T[]) {
  if (items.length === 0)
    return yield* Effect.fail(
      new Error("Collection is empty, cannot infer displayKey. Please provide at least one item"),
    );
  return Object.keys(items[0])[0] as keyof T;
});

export const collection = Effect.fn(function* <T extends object = any>(items: T[], displayKey?: keyof T) {
  const _items = yield* Ref.make(items);
  let _dk = displayKey;
  if (!_dk) {
    _dk = yield* getFirstKey(items);
  }
  const _displayKey = displayKey ?? _dk;

  const dk = yield* Ref.make<keyof T | undefined>(_displayKey);
  const options: IFuseOptions<T> = { keys: [_displayKey as FuseOptionKey<T>], distance: 2 };

  const preIndex = Fuse.createIndex(options.keys!, items);

  const fuse = yield* Ref.make(new Fuse(items, options, preIndex));

  const sorting = yield* Ref.make<Sorting<T>[]>([]);

  const hasSorted = yield* Ref.make(false);

  const getItems = Effect.fn(function* () {
    return yield* Ref.get(_items);
  });

  const setItems = Effect.fn(function* (newItems: T[]) {
    yield* Ref.set(_items, newItems);
    yield* Ref.set(hasSorted, false);
  });

  const setFilterKeys = Effect.fn(function* (keys: FuseOptionKey<T>[]) {
    const _fuse = new Fuse(items, { keys });
    yield* Ref.set(fuse, _fuse);
  });

  const filter = Effect.fn(function* (search: string) {
    const allFiles = yield* Ref.get(_items);
    const searcher = yield* Ref.get(fuse);
    searcher.setCollection(allFiles);
    const filtered = searcher.search(search).map((o) => o.item);
    yield* setItems(filtered);
    return filtered;
  });

  const addItem = Effect.fn(function* (item: T) {
    yield* Ref.update(_items, (items) => {
      items.push(item);
      return items;
    });
    yield* Ref.set(hasSorted, false);
  });

  const removeItem = Effect.fn(function* (item: T) {
    yield* Ref.update(_items, (items) => {
      items.splice(items.indexOf(item), 1);
      return items;
    });

    yield* Ref.set(hasSorted, false);
  });

  const clearItems = Effect.fn(function* () {
    yield* Ref.set(_items, []);
    yield* Ref.set(hasSorted, false);
  });

  const addSort = Effect.fn(function* (...sorters: Sorting<T>[]) {
    yield* Ref.update(sorting, (sortings) => {
      sortings.push(...sorters);
      return sortings;
    });
    yield* Ref.set(hasSorted, false);
  });

  const resetSort = Effect.fn(function* (...sorters: Sorting<T>[]) {
    yield* Ref.set(sorting, sorters);
    yield* Ref.set(hasSorted, false);
  });

  const removeSort = Effect.fn(function* (...sorters: Sorting<T>[]) {
    yield* Ref.update(sorting, (sortings) => {
      for (const sorter of sorters) {
        const index = sortings.findIndex((s) => s.key === sorter.key && s.fn === sorter.fn);
        if (index >= 0) sortings.splice(index, 1);
      }
      return sortings;
    });
    yield* Ref.set(hasSorted, false);
  });

  const updateSortDirection = Effect.fn(function* (id: string, direction: "asc" | "desc") {
    yield* Ref.update(sorting, (sortings) => {
      const index = sortings.findIndex((s) => s.id === id);
      if (index >= 0) {
        sortings[index].direction = direction;
      }
      return sortings;
    });
    yield* Ref.set(hasSorted, false);
  });

  const onUpdate = Effect.fn(function* () {
    const hs = yield* Ref.get(hasSorted);
    if (hs) return;
    const items = yield* getItems();
    const sortings = yield* Ref.get(sorting);

    const sorted = pipe(
      items,
      Arr.sortBy(
        ...sortings.map(({ fn, key, direction }) => {
          const fn1 = (item: T) => item[key];
          const directionFn =
            direction === "desc"
              ? Order.reverse<T[keyof T]>(fn as Order.Order<T[keyof T]>)
              : (fn as Order.Order<T[keyof T]>); // combinator
          return Order.mapInput<T[keyof T], T>(directionFn, fn1);
        }),
      ),
    );

    yield* Ref.set(_items, sorted);
    yield* Ref.set(hasSorted, true);
  });

  const getDisplayKey = Effect.fn(function* () {
    return yield* Ref.get(dk);
  });

  return {
    getItems,
    setItems,
    addItem,
    removeItem,
    clearItems,
    addSort,
    resetSort,
    removeSort,
    onUpdate,
    updateSortDirection,
    getDisplayKey,
    filter,
    setFilterKeys,
  } as GenericCollection<T>;
});
