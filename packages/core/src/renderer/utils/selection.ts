import { Effect, Ref } from "effect";
import { coordinateToCharacterIndex, type fonts } from "../../ascii/ascii.font";
import type { SelectionState } from "../../types";
import type { BaseElement } from "../elements/base";

export class Selection {
  private _anchor: { x: number; y: number };
  private _focus: { x: number; y: number };
  private _selectedRenderables: BaseElement<any, any>[] = [];

  constructor(anchor: { x: number; y: number }, focus: { x: number; y: number }) {
    this._anchor = { ...anchor };
    this._focus = { ...focus };
  }

  get anchor(): { x: number; y: number } {
    return { ...this._anchor };
  }

  get focus(): { x: number; y: number } {
    return { ...this._focus };
  }

  get bounds(): { startX: number; startY: number; endX: number; endY: number } {
    return {
      startX: Math.min(this._anchor.x, this._focus.x),
      startY: Math.min(this._anchor.y, this._focus.y),
      endX: Math.max(this._anchor.x, this._focus.x),
      endY: Math.max(this._anchor.y, this._focus.y),
    };
  }

  updateSelectedRenderables(selectedRenderables: BaseElement<any, any>[]): void {
    this._selectedRenderables = selectedRenderables;
  }

  getSelectedText = Effect.gen(this, function* () {
    const selectedRenderables = this._selectedRenderables;

    const sortedSelectedTexts = yield* Effect.all(
      selectedRenderables.map(
        Effect.fn(function* (renderable: BaseElement<any, any>) {
          const { x, y } = yield* Ref.get(renderable.location);

          return { x, y, id: renderable.id };
        }),
      ),
    );

    const selectedTexts = sortedSelectedTexts.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    const selectedTexts2 = yield* Effect.all(
      selectedTexts.map((r) => selectedRenderables.find((el) => el.id === r.id)!).map((e) => e.getSelectedText()),
    );

    // The original code returns selected elements joined with "\n".
    // If Element has a text property or toString, adjust here accordingly.
    // We assume Element implements meaningful toString(), or replace with .text
    return selectedTexts2.join("\n");
  });
}

export class TextSelectionHelper {
  private localSelection: { start: number; end: number } | null = null;
  private cachedGlobalSelection: SelectionState | null = null;

  constructor(
    private getX: () => Effect.Effect<number>,
    private getY: () => Effect.Effect<number>,
    private getTextLength: () => Effect.Effect<number>,
    private getLineInfo?: () => { lineStarts: number[]; lineWidths: number[] },
  ) {}

  hasSelection(): boolean {
    return this.localSelection !== null;
  }

  getSelection(): { start: number; end: number } | null {
    return this.localSelection;
  }

  reevaluateSelection = (width: number, height: number = 1) =>
    Effect.gen(this, function* () {
      if (!this.cachedGlobalSelection) {
        return false;
      }
      return yield* this.onSelectionChanged(this.cachedGlobalSelection, width, height);
    });

  shouldStartSelection = (x: number, y: number, width: number, height: number) =>
    Effect.gen(this, function* () {
      const myX = yield* this.getX();
      const myY = yield* this.getY();
      const localX = x - myX;
      const localY = y - myY;
      return localX >= 0 && localX < width && localY >= 0 && localY < height;
    });

  onSelectionChanged = (selection: SelectionState | null, width: number, height: number = 1) =>
    Effect.gen(this, function* () {
      this.cachedGlobalSelection = selection;

      const previousSelection = this.localSelection;

      if (!selection?.isActive) {
        this.localSelection = null;
        return previousSelection !== null;
      }

      const myY = yield* this.getY();
      const myEndY = myY + height - 1;

      if (myEndY < selection.anchor.y || myY > selection.focus.y) {
        this.localSelection = null;
        return previousSelection !== null;
      }

      if (height === 1) {
        this.localSelection = yield* this.calculateSingleLineSelection(
          myY,
          selection.anchor.y,
          selection.focus.y,
          selection.anchor.x,
          selection.focus.x,
          width,
        );
      } else {
        this.localSelection = yield* this.calculateMultiLineSelection(
          myY,
          selection.anchor.y,
          selection.focus.y,
          selection.anchor.x,
          selection.focus.x,
        );
      }

      return (
        (this.localSelection !== null) !== (previousSelection !== null) ||
        this.localSelection?.start !== previousSelection?.start ||
        this.localSelection?.end !== previousSelection?.end
      );
    });

  private calculateSingleLineSelection = (
    lineY: number,
    anchorY: number,
    focusY: number,
    anchorX: number,
    focusX: number,
    width: number,
  ) =>
    Effect.gen(this, function* () {
      const textLength = yield* this.getTextLength();
      const myX = yield* this.getX();

      // Entire line is selected
      if (lineY > anchorY && lineY < focusY) {
        return { start: 0, end: textLength };
      }

      // Selection spans this single line
      if (lineY === anchorY && lineY === focusY) {
        const start = Math.max(0, Math.min(anchorX - myX, textLength));
        const end = Math.max(0, Math.min(focusX - myX, textLength));
        return start < end ? { start, end } : null;
      }

      // Line is at start of selection
      if (lineY === anchorY) {
        const start = Math.max(0, Math.min(anchorX - myX, textLength));
        return start < textLength ? { start, end: textLength } : null;
      }

      // Line is at end of selection
      if (lineY === focusY) {
        const end = Math.max(0, Math.min(focusX - myX, textLength));
        return end > 0 ? { start: 0, end } : null;
      }

      return null;
    });

  private calculateMultiLineSelection = (
    startY: number,
    anchorY: number,
    focusY: number,
    anchorX: number,
    focusX: number,
  ) =>
    Effect.gen(this, function* () {
      const lineInfo = this.getLineInfo?.();
      if (!lineInfo) {
        // Fallback: select entire text if we overlap with selection
        return { start: 0, end: yield* this.getTextLength() };
      }

      const myX = yield* this.getX();
      let selectionStart: number | null = null;
      let selectionEnd: number | null = null;

      for (let i = 0; i < lineInfo.lineStarts.length; i++) {
        const lineY = startY + i;

        if (lineY < anchorY || lineY > focusY) continue;

        const lineStart = lineInfo.lineStarts[i];
        const lineEnd =
          i < lineInfo.lineStarts.length - 1 ? lineInfo.lineStarts[i + 1] - 1 : yield* this.getTextLength();
        const lineWidth = lineInfo.lineWidths[i];

        if (lineY > anchorY && lineY < focusY) {
          // Entire line is selected
          if (selectionStart === null) selectionStart = lineStart;
          selectionEnd = lineEnd;
        } else if (lineY === anchorY && lineY === focusY) {
          // Selection starts and ends on this line
          const localStartX = Math.max(0, Math.min(anchorX - myX, lineWidth));
          const localEndX = Math.max(0, Math.min(focusX - myX, lineWidth));
          if (localStartX < localEndX) {
            selectionStart = lineStart + localStartX;
            selectionEnd = lineStart + localEndX;
          }
        } else if (lineY === anchorY) {
          // Selection starts on this line
          const localStartX = Math.max(0, Math.min(anchorX - myX, lineWidth));
          if (localStartX < lineWidth) {
            selectionStart = lineStart + localStartX;
            selectionEnd = lineEnd;
          }
        } else if (lineY === focusY) {
          // Selection ends on this line
          const localEndX = Math.max(0, Math.min(focusX - myX, lineWidth));
          if (localEndX > 0) {
            if (selectionStart === null) selectionStart = lineStart;
            selectionEnd = lineStart + localEndX;
          }
        }
      }

      return selectionStart !== null && selectionEnd !== null && selectionStart < selectionEnd
        ? { start: selectionStart, end: selectionEnd }
        : null;
    });
}

export class ASCIIFontSelectionHelper {
  private localSelection: { start: number; end: number } | null = null;
  private cachedGlobalSelection: SelectionState | null = null;

  constructor(
    private getX: () => Effect.Effect<number>,
    private getY: () => Effect.Effect<number>,
    private getText: () => Effect.Effect<string>,
    private getFont: () => keyof typeof fonts,
  ) {}

  hasSelection(): boolean {
    return this.localSelection !== null;
  }

  getSelection(): { start: number; end: number } | null {
    return this.localSelection;
  }

  shouldStartSelection = (x: number, y: number, width: number, height: number) =>
    Effect.gen(this, function* () {
      const myX = yield* this.getX();
      const myY = yield* this.getY();
      const localX = x - myX;
      const localY = y - myY;

      if (localX < 0 || localX >= width || localY < 0 || localY >= height) {
        return false;
      }

      const text = yield* this.getText();
      const font = this.getFont();
      const charIndex = yield* coordinateToCharacterIndex(localX, text, font);

      return charIndex >= 0 && charIndex <= text.length;
    });

  onSelectionChanged = (selection: SelectionState | null, width: number, height: number) =>
    Effect.gen(this, function* () {
      this.cachedGlobalSelection = selection;

      const previousSelection = this.localSelection;

      if (!selection?.isActive) {
        this.localSelection = null;
        return previousSelection !== null;
      }

      const myX = yield* this.getX();
      const myY = yield* this.getY();
      const myEndY = myY + height - 1;
      const text = yield* this.getText();
      const font = this.getFont();

      let selStart: { x: number; y: number };
      let selEnd: { x: number; y: number };

      if (
        selection.anchor.y < selection.focus.y ||
        (selection.anchor.y === selection.focus.y && selection.anchor.x <= selection.focus.x)
      ) {
        selStart = selection.anchor;
        selEnd = selection.focus;
      } else {
        selStart = selection.focus;
        selEnd = selection.anchor;
      }

      if (myEndY < selStart.y || myY > selEnd.y) {
        this.localSelection = null;
        return previousSelection !== null;
      }

      let startCharIndex = 0;
      let endCharIndex = text.length;

      if (selStart.y > myEndY) {
        // Selection starts below us - we're not selected
        this.localSelection = null;
        return previousSelection !== null;
      } else if (selStart.y >= myY && selStart.y <= myEndY) {
        // Selection starts within our Y range - use the actual start X coordinate
        const localX = selStart.x - myX;
        if (localX > 0) {
          startCharIndex = yield* coordinateToCharacterIndex(localX, text, font);
        }
      }

      if (selEnd.y < myY) {
        // Selection ends above us - we're not selected
        this.localSelection = null;
        return previousSelection !== null;
      } else if (selEnd.y >= myY && selEnd.y <= myEndY) {
        // Selection ends within our Y range - use the actual end X coordinate
        const localX = selEnd.x - myX;
        if (localX >= 0) {
          endCharIndex = yield* coordinateToCharacterIndex(localX, text, font);
        } else {
          endCharIndex = 0;
        }
      }

      if (startCharIndex < endCharIndex && startCharIndex >= 0 && endCharIndex <= text.length) {
        this.localSelection = { start: startCharIndex, end: endCharIndex };
      } else {
        this.localSelection = null;
      }

      return (
        (this.localSelection !== null) !== (previousSelection !== null) ||
        this.localSelection?.start !== previousSelection?.start ||
        this.localSelection?.end !== previousSelection?.end
      );
    });

  reevaluateSelection = (width: number, height: number) =>
    Effect.gen(this, function* () {
      if (!this.cachedGlobalSelection) {
        return false;
      }
      return yield* this.onSelectionChanged(this.cachedGlobalSelection, width, height);
    });
}
