import type { Denops } from "jsr:@denops/std@^7.3.0";
import * as fn from "jsr:@denops/std@^7.3.0/function";
import * as buffer from "jsr:@denops/std@^7.3.0/buffer";

import { Spinner } from "../lib/spinner.ts";
import { adjustOffset } from "../lib/adjust_offset.ts";
import { BaseComponent, type ComponentParams } from "./_component.ts";

export const HIGHLIGHT_HEADER = "FillInputHeader";
export const HIGHLIGHT_CURSOR = "FillInputCursor";
export const HIGHLIGHT_COUNTER = "FillInputCounter";

export type InputComponentParams = ComponentParams & {
  title?: string;
  spinner?: readonly string[];
  headSymbol?: string;
  failSymbol?: string;
};

export class InputComponent extends BaseComponent {
  readonly #spinner: Spinner;
  readonly #headSymbol: string;
  readonly #failSymbol: string;

  #title = "";
  #cmdline = "";
  #cmdpos = 0;
  #offset = 0;
  #collected = 0;
  #processed = 0;
  #truncated = false;
  #collecting: boolean | "failed" = false;
  #processing: boolean | "failed" = false;
  #modifiedWindow = true;
  #modifiedContent = true;

  constructor(
    { title, spinner, headSymbol, failSymbol, ...params }: InputComponentParams,
  ) {
    super(params);
    this.#title = title ?? "";
    this.#spinner = new Spinner(spinner);
    this.#headSymbol = headSymbol ?? ">";
    this.#failSymbol = failSymbol ?? "X";
  }

  get title(): string {
    return this.#title;
  }

  set title(value: string) {
    this.#title = value;
    this.#modifiedWindow = true;
  }

  get cmdline(): string {
    return this.#cmdline;
  }

  set cmdline(value: string) {
    this.#cmdline = value;
    this.cmdpos = this.#cmdpos;
    this.#modifiedContent = true;
  }

  get cmdpos(): number {
    return this.#cmdpos;
  }

  set cmdpos(value: number) {
    // NOTE:
    // We should NOT check if 'cmdpos' is out of range here because it might be updated before the
    // 'cmdline' is updated.
    this.#cmdpos = value;
    this.#modifiedContent = true;
  }

  get collected(): number {
    return this.#collected;
  }

  set collected(value: number) {
    this.#collected = value;
    this.#modifiedContent = true;
  }

  get processed(): number {
    return this.#processed;
  }

  set processed(value: number) {
    this.#processed = value;
    this.#modifiedContent = true;
  }

  get truncated(): boolean {
    return this.#truncated;
  }

  set truncated(value: boolean) {
    this.#truncated = value;
    this.#modifiedContent = true;
  }

  get collecting(): boolean | "failed" {
    return this.#collecting;
  }

  set collecting(value: boolean | "failed") {
    this.#collecting = value;
    this.#modifiedContent = true;
  }

  get processing(): boolean | "failed" {
    return this.#processing;
  }

  set processing(value: boolean | "failed") {
    this.#processing = value;
    this.#modifiedContent = true;
  }

  get #prefix(): string {
    const head = this.processing
      ? this.processing === "failed" ? this.#failSymbol : this.#spinner.current
      : this.#headSymbol;
    return `${head} `;
  }

  get #suffix(): string {
    const mark = this.#truncated ? "+" : "";
    const tail = this.collecting
      ? this.collecting === "failed" ? this.#failSymbol : this.#spinner.current
      : "";
    return ` ${this.#processed}/${this.#collected}${mark} ${tail}`.trimEnd();
  }

  get #isSpinnerUpdated(): boolean {
    return (this.collecting || this.processing) && !this.#spinner.locked;
  }

  forceRender(): void {
    this.#modifiedWindow = true;
    this.#modifiedContent = true;
  }

  override async open(
    denops: Denops,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<AsyncDisposable> {
    await using stack = new AsyncDisposableStack();
    stack.use(await super.open(denops, { signal }));
    signal?.throwIfAborted();
    await fn.win_execute(
      denops,
      this.info!.winid,
      "setlocal signcolumn=no nofoldenable nonumber norelativenumber",
    );
    this.forceRender();
    return stack.move();
  }

  async render(
    denops: Denops,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<true | void> {
    try {
      const results = [
        await this.#renderWindow(denops, { signal }),
        await this.#renderContent(denops, { signal }),
      ];
      return results.some((result) => result) ? true : undefined;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const m = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to render content of the input component: ${m}`);
    }
  }

  async #renderWindow(
    denops: Denops,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<true | void> {
    if (!this.info) return;
    if (!this.#modifiedWindow) return;
    this.#modifiedWindow = false;

    await this.update(denops, {
      title: this.#title ? ` ${this.#title} ` : undefined,
    });
    signal?.throwIfAborted();
  }

  async #renderContent(
    denops: Denops,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<true | void> {
    if (!this.info) return;
    if (!this.#modifiedContent && !this.#isSpinnerUpdated) return;
    this.#modifiedContent = false;

    const { bufnr } = this.info;
    const { width } = this.dimension;

    const prefix = this.#prefix;
    const suffix = this.#suffix;
    const cmdwidth = width - prefix.length - suffix.length;

    this.#offset = adjustOffset(
      this.#offset,
      this.#cmdpos,
      this.#cmdline.length,
      cmdwidth,
      2,
    );

    // TODO:
    // When 'cmdline' includes control characters that is displayed like '^Y', the display width
    // is not equal to the length of the string. So we need to slice 'middle' to fit in the cmdwidth
    // properly.
    const spacer = " ".repeat(cmdwidth);
    const middle = `${this.#cmdline}${spacer}`.slice(
      this.#offset,
      this.#offset + cmdwidth,
    );
    const prefixByteLength = getByteLength(prefix);
    const middleByteLength = getByteLength(middle);
    const suffixByteLength = getByteLength(suffix);

    await buffer.replace(denops, bufnr, [prefix + middle + suffix]);
    signal?.throwIfAborted();

    await buffer.undecorate(denops, bufnr);
    signal?.throwIfAborted();

    await buffer.decorate(denops, bufnr, [
      {
        line: 1,
        column: 1,
        length: prefixByteLength,
        highlight: HIGHLIGHT_HEADER,
      },
      {
        line: 1,
        column: Math.max(
          1,
          prefixByteLength + this.#cmdpos - this.#offset,
        ),
        length: 1,
        highlight: HIGHLIGHT_CURSOR,
      },
      {
        line: 1,
        column: 1 + prefixByteLength + middleByteLength,
        length: suffixByteLength,
        highlight: HIGHLIGHT_COUNTER,
      },
    ]);

    return true;
  }

  override async [Symbol.asyncDispose](): Promise<void> {
    await super[Symbol.asyncDispose]();
    this.#spinner[Symbol.dispose]();
  }
}

const encoder = new TextEncoder();
function getByteLength(str: string): number {
  return encoder.encode(str).length;
}