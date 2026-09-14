"use client";
import { useState, useRef, useEffect } from "react";
import { ImageUpload } from "./image-upload";
import { WallCanvas } from "./wall-canvas";
import {
  withPrimaryImage,
  designImageKeys,
  designTemplate,
  newDesignBlock,
  parseWallDesign,
  type DesignImage,
  type DesignBlock,
  type DesignBox,
} from "@/lib/wall-design";
type DesignSnapshot = {
  value: string;
  images: DesignImage[];
  selected: string;
};
export default function WallDesigner({
  value,
  images,
  title,
  message,
  primaryImage,
  onChange,
  onPending,
}: {
  value: string;
  images: DesignImage[];
  title: string;
  message: string;
  primaryImage?: string;
  onChange: (value: string, images: DesignImage[]) => void;
  onPending: (pending: boolean) => void;
}) {
  const availableImages = [
    ...images.filter((image) => image.key !== "logo"),
    ...(primaryImage ? [{ key: "logo", url: primaryImage }] : []),
  ];
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop"),
    [selected, setSelected] = useState(""),
    [pending, setPending] = useState(false);
  const [past, setPast] = useState<DesignSnapshot[]>([]);
  const [future, setFuture] = useState<DesignSnapshot[]>([]);
  const [overflow, setOverflow] = useState<string[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    recorded: boolean;
    id: string;
    x: number;
    y: number;
    box: DesignBox;
    resize: boolean;
    width: number;
    height: number;
  } | null>(null);
  let design;
  try {
    design = parseWallDesign(value, true);
  } catch {
    design = null;
  }
  const d = design;
  const block = d?.blocks.find((b) => b.id === selected);
  const commit = (nextValue: string, nextImages = images) => {
    if (nextValue === value && nextImages === images) return;
    if (!drag.current?.recorded) {
      setPast((items) => [...items.slice(-59), { value, images, selected }]);
      if (drag.current) drag.current.recorded = true;
    }
    setFuture([]);
    onChange(nextValue, nextImages);
  };
  const restore = (redo = false) => {
    if (pending) return;
    const source = redo ? future : past;
    const snapshot = source.at(-1);
    if (!snapshot) return;
    const current = { value, images, selected };
    if (redo) {
      setFuture(source.slice(0, -1));
      setPast((items) => [...items.slice(-59), current]);
    } else {
      setPast(source.slice(0, -1));
      setFuture((items) => [...items.slice(-59), current]);
    }
    drag.current = null;
    setSelected(snapshot.selected);
    onChange(snapshot.value, snapshot.images);
  };
  const save = (next: NonNullable<typeof d>) => commit(JSON.stringify(next));
  useEffect(() => {
    const canvas = stage.current;
    if (!canvas) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const ids = Array.from(
        canvas.querySelectorAll<HTMLElement>(".canvas-block"),
      )
        .filter((element) => {
          const text = element.querySelector<HTMLElement>(
            "h2,p,.canvas-link-preview",
          );
          if (!text) return false;
          const box = element.getBoundingClientRect();
          const content = text.getBoundingClientRect();
          return (
            content.height > box.height - 8 + 1 ||
            text.scrollWidth > text.clientWidth + 1 ||
            content.top + Math.max(content.height, text.scrollHeight) >
              box.bottom + 1
          );
        })
        .map((element) => element.dataset.blockId!);
      setOverflow((current) => (current.join() === ids.join() ? current : ids));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    canvas
      .querySelectorAll(".canvas-block")
      .forEach((element) => observer.observe(element));
    void document.fonts.ready.then(measure);
    measure();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [value, device]);
  const update = (patch: Partial<DesignBlock>) => {
    if (d && block)
      save({
        ...d,
        blocks: d.blocks.map((b) =>
          b.id === block.id ? { ...b, ...patch } : b,
        ),
      });
  };
  const removeBlock = (id: string) => {
    if (!d || d.blocks.length <= 1 || pending) return;
    save({ ...d, blocks: d.blocks.filter((b) => b.id !== id) });
    setSelected("");
    drag.current = null;
  };
  const boxUpdate = (patch: Partial<DesignBox>) => {
    if (!block) return;
    const box = { ...block[device], ...patch };
    box.w = Math.max(5, Math.min(100, box.w));
    box.h = Math.max(5, Math.min(100, box.h));
    box.x = Math.max(0, Math.min(100 - box.w, box.x));
    box.y = Math.max(0, Math.min(100 - box.h, box.y));
    update({ [device]: box });
  };
  return (
    <section
      className="wall-designer"
      aria-label="Wall Designer"
      data-active={!!d}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("input,textarea,select,[contenteditable=true]"))
          return;
        if (
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          ["z", "y"].includes(e.key.toLowerCase())
        ) {
          e.preventDefault();
          restore(e.key.toLowerCase() === "y" || e.shiftKey);
        }
      }}
    >
      <div className="designer-heading">
        <div>
          <h3>Your wall. Your design.</h3>
          <p>
            Arrange your canvas between the stats. Build your own page with up
            to 24 blocks.
          </p>
        </div>
        <div className="designer-actions">
          <button
            type="button"
            aria-pressed={!d}
            disabled={pending}
            onClick={() => commit("", images)}
          >
            Quick setup
          </button>
          <button
            type="button"
            aria-pressed={!!d}
            disabled={pending}
            onClick={() => {
              if (!d) {
                const next = designTemplate("launch", title, message);
                if (primaryImage) {
                  const image = newDesignBlock("image", 0);
                  image.image = "logo";
                  image.text = title || "Owner image";
                  image.desktop = { x: 2, y: 2, w: 20, h: 20 };
                  image.mobile = { x: 5, y: 1, w: 30, h: 12 };
                  next.blocks.push(image);
                }
                save(next);
              }
            }}
          >
            Design my wall
          </button>
        </div>
      </div>
      {!d && (
        <section className="design-examples" aria-label="Example wall designs">
          <h4>Start with a look. Make it yours.</h4>
          <p>
            Example designs, not live takeovers. Applying a look keeps your
            name, message and uploaded image.
          </p>
          <div className="design-example-grid">
            {[
              {
                key: "launch",
                label: "Product launch",
                heading: "MEET YOUR NEXT BIG IDEA.",
                text: "A home for what you’re building.",
              },
              {
                key: "poster",
                label: "Bold poster",
                heading: "IMPOSSIBLE TO IGNORE.",
                text: "Your message. Front and center.",
              },
              {
                key: "message",
                label: "Personal message",
                heading: "THIS MOMENT IS YOURS.",
                text: "Celebrate someone. Say something.",
              },
            ].map((example) => (
              <button
                key={example.key}
                type="button"
                className="design-example"
                data-look={example.key}
                disabled={pending}
                onClick={() => {
                  const template = JSON.stringify(
                    designTemplate(example.key, title, message),
                  );
                  commit(
                    primaryImage ? withPrimaryImage(template, title) : template,
                  );
                  setSelected("");
                }}
              >
                <span className="design-example-art" aria-hidden="true">
                  <b>{example.heading}</b>
                  <span>{example.text}</span>
                  <i>{example.key === "message" ? "♥" : "Discover more ↗"}</i>
                </span>
                <span className="design-example-caption">
                  Use {example.label.toLowerCase()}{" "}
                  <span aria-hidden="true">↗</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="designer-actions" aria-label="Design history">
        <button
          type="button"
          disabled={!past.length || pending}
          onClick={() => restore()}
          title="Undo (Ctrl/Cmd+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!future.length || pending}
          onClick={() => restore(true)}
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          Redo
        </button>
      </div>
      {d && (
        <>
          <div className="designer-actions">
            <label>
              Start from a template
              <select
                disabled={pending}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    save(designTemplate(e.target.value, title, message));
                    setSelected("");
                  }
                  e.target.value = "";
                }}
              >
                <option value="">Choose template</option>
                <option value="launch">Product launch</option>
                <option value="poster">Bold poster</option>
                <option value="message">Personal message</option>
                <option value="minimal">Minimal</option>
              </select>
            </label>
            <div className="designer-actions" aria-label="Canvas device">
              {(["desktop", "mobile"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={device === mode}
                  onClick={() => setDevice(mode)}
                >
                  {mode === "desktop" ? "Desktop canvas" : "Mobile canvas"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                save({
                  ...d,
                  blocks: d.blocks.map((b, i) => ({
                    ...b,
                    mobile: {
                      x: 5,
                      y: 4 + i * (92 / d.blocks.length),
                      w: 90,
                      h: Math.max(5, 88 / d.blocks.length),
                    },
                  })),
                })
              }
            >
              Stack mobile blocks
            </button>
          </div>
          <div
            className="designer-canvas-toolbar"
            aria-label="Add wall content"
          >
            <strong>Add to your wall</strong>
            <div className="designer-add-blocks">
              {(["heading", "text", "image", "button"] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  disabled={d.blocks.length >= 24}
                  onClick={() => {
                    const b = newDesignBlock(type, d.blocks.length);
                    if (type === "text" || type === "heading")
                      b.color =
                        d.blocks.find(
                          (existing) =>
                            existing.type === "heading" ||
                            existing.type === "text",
                        )?.color ?? "#11110f";
                    if (type === "image")
                      b.image = availableImages[0]?.key ?? "";
                    save({ ...d, blocks: [...d.blocks, b] });
                    setSelected(b.id);
                  }}
                >
                  <span aria-hidden="true">
                    {type === "heading" ? (
                      "H"
                    ) : type === "text" ? (
                      "T"
                    ) : (
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        {type === "image" ? (
                          <>
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8" cy="8" r="1.5" />
                            <path d="m3 17 6-6 4 4 3-3 5 5" />
                          </>
                        ) : (
                          <>
                            <rect x="3" y="7" width="18" height="10" rx="2" />
                            <path d="M7 12h10m-3-3 3 3-3 3" />
                          </>
                        )}
                      </svg>
                    )}
                  </span>
                  Add {type}
                </button>
              ))}
            </div>
          </div>
          <p className="designer-device-note">
            Editing {device === "desktop" ? "desktop" : "mobile"} layout ·
            Switch above to check both screen sizes. Positions and sizes are
            independent.
          </p>
          <div className="designer-workspace">
            <div>
              <div
                ref={stage}
                className={`designer-stage ${device}`}
                tabIndex={0}
                aria-label="Design canvas. Select a block to drag; arrow keys move the selected block; Delete removes it."
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (block && e.key === "Delete") {
                    e.preventDefault();
                    removeBlock(block.id);
                    return;
                  }
                  if (
                    block &&
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(e.key)
                  ) {
                    e.preventDefault();
                    const b = block[device];
                    boxUpdate({
                      x:
                        b.x +
                        (e.key === "ArrowRight"
                          ? 2
                          : e.key === "ArrowLeft"
                            ? -2
                            : 0),
                      y:
                        b.y +
                        (e.key === "ArrowDown"
                          ? 2
                          : e.key === "ArrowUp"
                            ? -2
                            : 0),
                    });
                  }
                }}
                onPointerDown={(e) => {
                  const target = (e.target as HTMLElement).closest<HTMLElement>(
                    "[data-block-id]",
                  );
                  const b = d.blocks.find(
                    (b) => b.id === target?.dataset.blockId,
                  );
                  if (!b) return;
                  e.preventDefault();
                  setSelected(b.id);
                  e.currentTarget.focus();
                  const rect = (
                    e.currentTarget.querySelector(".canvas-content") ??
                    e.currentTarget
                  ).getBoundingClientRect();
                  drag.current = {
                    recorded: false,
                    id: b.id,
                    x: e.clientX,
                    y: e.clientY,
                    box: { ...b[device] },
                    resize: !!(e.target as HTMLElement).closest(
                      "[data-resize]",
                    ),
                    width: rect.width,
                    height: rect.height,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const g = drag.current;
                  if (!g) return;
                  const snap = (n: number) => Math.round(n / 2) * 2;
                  const dx = ((e.clientX - g.x) / g.width) * 100,
                    dy = ((e.clientY - g.y) / g.height) * 100;
                  const box = { ...g.box };
                  if (g.resize) {
                    box.w = Math.max(
                      5,
                      Math.min(100 - box.x, snap(g.box.w + dx)),
                    );
                    box.h = Math.max(
                      5,
                      Math.min(100 - box.y, snap(g.box.h + dy)),
                    );
                  } else {
                    box.x = Math.max(
                      0,
                      Math.min(100 - box.w, snap(g.box.x + dx)),
                    );
                    box.y = Math.max(
                      0,
                      Math.min(100 - box.h, snap(g.box.y + dy)),
                    );
                  }
                  save({
                    ...d,
                    blocks: d.blocks.map((b) =>
                      b.id === g.id ? { ...b, [device]: box } : b,
                    ),
                  });
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <WallCanvas
                  design={value}
                  images={availableImages}
                  device={device}
                  editing
                  selected={selected}
                  onDelete={removeBlock}
                  deleteDisabled={d.blocks.length <= 1 || pending}
                  overflowing={overflow}
                />
              </div>
              {overflow.length > 0 && (
                <div className="designer-overflow-warning" role="status">
                  <strong>
                    Text doesn’t fit in {overflow.length}{" "}
                    {overflow.length === 1 ? "block" : "blocks"} on {device}.
                  </strong>
                  <p>
                    Enlarge the block, reduce its font size, or shorten the
                    text. Check the other layout too.
                  </p>
                  {d.blocks
                    .filter((b) => overflow.includes(b.id))
                    .map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => setSelected(b.id)}
                      >
                        Edit {b.type}: {b.text.slice(0, 25) || "Untitled"}
                      </button>
                    ))}
                </div>
              )}
              <p className="field-note">
                Drag to move, use the corner to resize, or press Delete to
                remove a selected block. Mobile positions are independent. Give
                each button its own link. Changes are saved in your checkout
                draft.
              </p>
            </div>
            <div className="designer-inspector">
              <div className="designer-control-group">
                <h4>Background & images</h4>
                <div className="designer-actions">
                  <label>
                    Background color
                    <input
                      type="color"
                      value={d.background}
                      onChange={(e) =>
                        save({ ...d, background: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Gradient color
                    <input
                      type="color"
                      value={d.gradient || d.background}
                      onChange={(e) => save({ ...d, gradient: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => save({ ...d, gradient: "" })}
                  >
                    Solid color
                  </button>
                </div>
                <label>
                  Background image
                  <select
                    value={d.backgroundImage}
                    onChange={(e) =>
                      save({ ...d, backgroundImage: e.target.value })
                    }
                  >
                    <option value="">No background image</option>
                    {availableImages.map((a, i) => (
                      <option key={a.key} value={a.key}>
                        Image {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <ImageUpload
                  label="Upload canvas image"
                  disabled={
                    images.filter((image) => image.key !== "logo").length >=
                      16 ||
                    (d.blocks.length >= 24 &&
                      !(block?.type === "image" && !block.image))
                  }
                  onPending={(p) => {
                    setPending(p);
                    onPending(p);
                  }}
                  onUploaded={(r) => {
                    const asset = {
                      key: crypto.randomUUID(),
                      url: r.logoUrl,
                      uploadKey: r.uploadKey,
                    };
                    const nextBlock =
                      block?.type === "image" && !block.image
                        ? { ...block, image: asset.key }
                        : {
                            ...newDesignBlock("image", d.blocks.length),
                            image: asset.key,
                            text: "Uploaded image",
                          };
                    const next = {
                      ...d,
                      blocks:
                        block?.type === "image" && !block.image
                          ? d.blocks.map((b) =>
                              b.id === block.id ? nextBlock : b,
                            )
                          : [...d.blocks, nextBlock],
                    };
                    commit(JSON.stringify(next), [...images, asset]);
                    setSelected(nextBlock.id);
                  }}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    commit(
                      value,
                      images.filter((image) =>
                        designImageKeys(d).includes(image.key),
                      ),
                    )
                  }
                >
                  Remove unused images
                </button>
              </div>
              <div className="designer-control-group">
                <h4>Select a block · {d.blocks.length}/24</h4>
                <label>
                  Selected block
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Choose a block</option>
                    {d.blocks.map((b, i) => (
                      <option value={b.id} key={b.id}>
                        {i + 1}. {b.type}: {b.text.slice(0, 24)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="field-note">
                  Select a block on the canvas or from this list to customize
                  it. Keep at least one block in your design.
                </p>
              </div>
              {block && (
                <div className="designer-control-group designer-block-settings">
                  <h4>Selected {block.type} settings</h4>
                  {block && (
                    <>
                      <label>
                        {block.type === "image"
                          ? "Image description"
                          : "Block text"}
                        <textarea
                          maxLength={1000}
                          value={block.text}
                          onChange={(e) => update({ text: e.target.value })}
                        />
                      </label>
                      {block.type === "button" && (
                        <label>
                          Button destination URL
                          <input
                            type="url"
                            value={block.href ?? ""}
                            placeholder="https://your-website.com/page"
                            onChange={(e) => update({ href: e.target.value })}
                          />
                          <small>
                            Leave blank to use your main website link.
                          </small>
                        </label>
                      )}
                      {block.type === "image" ? (
                        <>
                          <label>
                            Block image
                            <select
                              value={block.image}
                              onChange={(e) =>
                                update({ image: e.target.value })
                              }
                            >
                              <option value="">Choose image</option>
                              {availableImages.map((a, i) => (
                                <option key={a.key} value={a.key}>
                                  Image {i + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Image crop
                            <select
                              value={block.fit}
                              onChange={(e) =>
                                update({
                                  fit: e.target.value as "cover" | "contain",
                                })
                              }
                            >
                              <option value="contain">Fit entire image</option>
                              <option value="cover">Fill and crop</option>
                            </select>
                          </label>
                        </>
                      ) : (
                        <>
                          <div className="designer-actions">
                            <label>
                              Text color
                              <input
                                type="color"
                                value={block.color}
                                onChange={(e) =>
                                  update({ color: e.target.value })
                                }
                              />
                            </label>
                            {block.type === "button" && (
                              <label>
                                Button color
                                <input
                                  type="color"
                                  value={block.fill}
                                  onChange={(e) =>
                                    update({ fill: e.target.value })
                                  }
                                />
                              </label>
                            )}
                          </div>
                          <label>
                            Font
                            <select
                              value={block.font}
                              onChange={(e) =>
                                update({
                                  font: e.target.value as DesignBlock["font"],
                                })
                              }
                            >
                              <option value="display">Bold display</option>
                              <option value="sans">Sans serif</option>
                              <option value="serif">Classic serif</option>
                            </select>
                          </label>
                          <label>
                            Text size
                            <input
                              type="range"
                              min={12}
                              max={96}
                              value={block.size}
                              onChange={(e) =>
                                update({ size: Number(e.target.value) })
                              }
                            />
                          </label>
                          <label>
                            Text alignment
                            <select
                              value={block.align}
                              onChange={(e) =>
                                update({
                                  align: e.target.value as DesignBlock["align"],
                                })
                              }
                            >
                              <option value="left">Left</option>
                              <option value="center">Center</option>
                              <option value="right">Right</option>
                            </select>
                          </label>
                        </>
                      )}
                      <div className="designer-coordinates">
                        {(["x", "y", "w", "h"] as const).map((k, i) => (
                          <label key={k}>
                            {["Left %", "Top %", "Width %", "Height %"][i]}
                            <input
                              type="number"
                              min={k === "w" || k === "h" ? 5 : 0}
                              max={100}
                              value={Math.round(block[device][k] * 10) / 10}
                              onChange={(e) =>
                                boxUpdate({ [k]: Number(e.target.value) })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="designer-actions">
                        <button
                          type="button"
                          onClick={() =>
                            save({
                              ...d,
                              blocks: [
                                ...d.blocks.filter((b) => b.id !== block.id),
                                block,
                              ],
                            })
                          }
                        >
                          Bring to front
                        </button>
                        <button
                          type="button"
                          disabled={d.blocks.length >= 24}
                          onClick={() => {
                            const copy = {
                              ...block,
                              id: crypto.randomUUID(),
                              desktop: { ...block.desktop },
                              mobile: { ...block.mobile },
                            };
                            save({ ...d, blocks: [...d.blocks, copy] });
                            setSelected(copy.id);
                          }}
                        >
                          Duplicate block
                        </button>
                        <button
                          type="button"
                          disabled={d.blocks.length <= 1 || pending}
                          onClick={() => removeBlock(block.id)}
                        >
                          Remove block
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
