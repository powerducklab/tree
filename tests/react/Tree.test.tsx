// @vitest-environment jsdom
import { StrictMode, createRef } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tree } from "../../src/react/Tree";
import type { TreeHandle } from "../../src/react/libs/types";
import type { TreeNode } from "../../src/core/types";

const nodes: TreeNode[] = [
  { id: "folder", name: "Folder", children: [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }] },
  { id: "zulu", name: "Zulu" },
];

describe("tree interaction", () => {
  it("uses one tab stop, valid levels, and arrow navigation", async () => {
    render(<Tree nodes={nodes} />);
    const folder = screen.getByRole("treeitem", { name: "Folder" });
    expect(folder).toHaveAttribute("aria-level", "1");
    expect(folder).toHaveAttribute("tabindex", "0");
    act(() => folder.focus());
    fireEvent.keyDown(folder, { key: "ArrowRight" });
    expect(folder).toHaveAttribute("aria-expanded", "true");
    const alpha = screen.getByRole("treeitem", { name: "Alpha" });
    expect(alpha).toHaveAttribute("aria-level", "2");
    fireEvent.keyDown(folder, { key: "ArrowRight" });
    await waitFor(() => expect(alpha).toHaveFocus());
    fireEvent.keyDown(alpha, { key: "ArrowLeft" });
    await waitFor(() => expect(folder).toHaveFocus());
    fireEvent.keyDown(folder, { key: "End" });
    await waitFor(() => expect(screen.getByRole("treeitem", { name: "Zulu" })).toHaveFocus());
    expect(screen.getAllByRole("treeitem").filter((row) => row.tabIndex === 0)).toHaveLength(1);
  });

  it("restores expansion after searching and honors explicitly empty defaults", async () => {
    render(<Tree nodes={nodes} searchable defaultExpandedIds={[]} defaultExpandDepth={5} />);
    expect(screen.queryByRole("treeitem", { name: "Alpha" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alpha" } });
    expect(await screen.findByRole("treeitem", { name: "Alpha" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "Alpha" })).not.toBeInTheDocument());
  });

  it("shows action buttons even when search is disabled", () => {
    const onRefresh = vi.fn();
    render(<Tree nodes={nodes} showExpandAll showRefresh onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("treeitem", { name: "Alpha" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("notifies expansion once in StrictMode", () => {
    const onExpandedChange = vi.fn();
    render(<StrictMode><Tree nodes={nodes} onExpandedChange={onExpandedChange} /></StrictMode>);
    fireEvent.click(screen.getByRole("treeitem", { name: "Folder" }));
    expect(onExpandedChange).toHaveBeenCalledOnce();
  });

  it("portals menus, preserves separator actions, and restores keyboard focus", async () => {
    const onClick = vi.fn();
    const { container } = render(<Tree nodes={nodes} contextMenuItems={() => [
      { label: "Unavailable", disabled: true, onClick },
      { label: "Rename", separator: true, onClick },
      { label: "Remove", confirm: true, danger: true, onClick },
    ]} />);
    const row = screen.getByRole("treeitem", { name: /Zulu/ });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    const menu = screen.getByRole("menu");
    expect(container.contains(menu)).toBe(false);
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Remove" })).toHaveFocus();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Confirm?" }));
    expect(onClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(row).toHaveFocus());
  });

  it("keeps modal menus in the dialog and Escape closes only the menu", () => {
    render(<dialog open><Tree nodes={nodes} contextMenuItems={() => [{ label: "Rename", onClick: vi.fn() }]} /></dialog>);
    fireEvent.click(screen.getByRole("button", { name: "More actions for Zulu" }));
    const menu = screen.getByRole("menu");
    expect(menu.closest("dialog")).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not activate a row when its action button receives Enter", () => {
    const onSelect = vi.fn();
    render(<Tree nodes={nodes} onSelect={onSelect} contextMenuItems={() => [{ label: "Rename", onClick: vi.fn() }]} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Zulu" }), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders a bounded window for 10,000 nodes and locates an offscreen row", async () => {
    const ref = createRef<TreeHandle>();
    const large = Array.from({ length: 10000 }, (_, i) => ({ id: `node-${i}`, name: `Node ${i}` }));
    render(<Tree nodes={large} ref={ref} maxHeight={400} />);
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(50);
    act(() => { ref.current!.locateNode((node) => node.id === "node-9999"); });
    expect(await screen.findByRole("treeitem", { name: "Node 9999" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(50);
  });

  it("clears search when locating a hidden node without selecting another instance", async () => {
    const ref = createRef<TreeHandle>();
    const first = render(<Tree nodes={nodes} ref={ref} searchable />);
    const second = render(<Tree nodes={nodes} />);
    fireEvent.change(within(first.container).getByRole("searchbox"), { target: { value: "missing" } });
    act(() => { ref.current!.locateNode((node) => node.id === "beta"); });
    expect(await within(first.container).findByRole("treeitem", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(within(second.container).queryByRole("treeitem", { name: "Beta" })).not.toBeInTheDocument();
  });

  it("ignores cyclic child edges when rendering expanded data", () => {
    const cycle: TreeNode = { id: "cycle", name: "Cycle", children: [] };
    cycle.children!.push(cycle);
    render(<Tree nodes={[cycle]} defaultExpandDepth={Infinity} />);
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
  });
});

describe("drag constraints", () => {
  function drag(source: HTMLElement, target: HTMLElement, relativeY = 0.9) {
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 0, height: 28 } as DOMRect);
    fireEvent.dragStart(source.querySelector('[draggable="true"]')!, { dataTransfer });
    const event = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(event, { clientY: { value: relativeY * 28 }, dataTransfer: { value: dataTransfer } });
    fireEvent(target, event);
    fireEvent.drop(target, { dataTransfer });
  }

  it("reorders siblings and emits an accurate array patch", () => {
    const onReorder = vi.fn();
    const onPatch = vi.fn();
    render(<Tree nodes={[{ id: "a", name: "A", metadata: { jsonPath: ["items", 0] } }, { id: "b", name: "B", metadata: { jsonPath: ["items", 1] } }]} draggable onReorder={onReorder} onPatch={onPatch} />);
    drag(screen.getByRole("treeitem", { name: "A" }), screen.getByRole("treeitem", { name: "B" }));
    expect(onReorder).toHaveBeenCalledOnce();
    expect(onPatch.mock.calls[0]?.[0]).toEqual([{ op: "move", from: ["items", 0], path: ["items", 1] }]);
  });

  it("does not emit array patches for object property paths", () => {
    const onPatch = vi.fn();
    render(<Tree nodes={[{ id: "a", name: "A", metadata: { jsonPath: ["properties", "a"] } }, { id: "b", name: "B", metadata: { jsonPath: ["properties", "b"] } }]} draggable onPatch={onPatch} />);
    drag(screen.getByRole("treeitem", { name: "A" }), screen.getByRole("treeitem", { name: "B" }));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("applies changed group restrictions and rejects descendant targets", () => {
    const onMove = vi.fn();
    const onReorder = vi.fn();
    const tree: TreeNode[] = [
      { id: "a", name: "A", metadata: { group: "first" }, children: [{ id: "child", name: "Child" }] },
      { id: "b", name: "B", metadata: { group: "second" } },
    ];
    const view = render(<Tree nodes={tree} draggable defaultExpandDepth={3} onMove={onMove} onReorder={onReorder} />);
    view.rerender(<Tree nodes={tree} draggable defaultExpandDepth={3} dragGroupKey="group" onMove={onMove} onReorder={onReorder} />);
    drag(screen.getByRole("treeitem", { name: "A" }), screen.getByRole("treeitem", { name: "B" }));
    drag(screen.getByRole("treeitem", { name: "A" }), screen.getByRole("treeitem", { name: "Child" }));
    expect(onMove).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("drops an operation into an empty folder when canDrop allows a child", () => {
    const onMove = vi.fn();
    const canDrop = (
      source: TreeNode,
      target: TreeNode,
      position: "before" | "after" | "child",
    ) =>
      source.metadata?.kind === "operation" &&
      target.metadata?.kind === "tag" &&
      position === "child";
    const tree: TreeNode[] = [
      { id: "tag:empty", name: "Empty", metadata: { kind: "tag" } },
      { id: "op:1", name: "Do thing", metadata: { kind: "operation", method: "get" } },
    ];
    render(<Tree nodes={tree} draggable canDrop={canDrop} onMove={onMove} />);
    const source = screen.getByRole("treeitem", { name: /Do thing/ });
    const folder = screen.getByRole("treeitem", { name: "Empty" });

    // Middle, top and bottom bands all resolve to "child" for an empty folder
    // whose only valid drop position is "child".
    drag(source, folder, 0.5);
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0]?.[2]).toBe("tag:empty");
  });
});

it("delegates context menu rendering to the onContextMenuOpen host hook", () => {
  const onContextMenuOpen = vi.fn();
  render(<Tree nodes={nodes} onContextMenuOpen={onContextMenuOpen} />);

  const row = screen.getByRole("treeitem", { name: "Zulu" });
  fireEvent.contextMenu(row, { clientX: 123, clientY: 234 });
  expect(onContextMenuOpen).toHaveBeenCalledOnce();
  expect(onContextMenuOpen.mock.calls[0][0]).toMatchObject({ x: 123, y: 234 });
  expect(onContextMenuOpen.mock.calls[0][0].node.id).toBe("zulu");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "More actions for Zulu" }));
  expect(onContextMenuOpen).toHaveBeenCalledTimes(2);
});

it("positions menus inside the usable viewport, excluding the browser scrollbar", () => {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(375);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(844);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 248, height: 115, left: 0, top: 0, bottom: 115 } as DOMRect);
  render(<Tree nodes={nodes} contextMenuItems={() => [{ label: "Inspect", onClick: vi.fn() }]} />);
  fireEvent.contextMenu(screen.getByRole("treeitem", { name: "Zulu" }), { clientX: 360, clientY: 800 });
  expect(screen.getByRole("menu")).toHaveStyle({ left: "119px", top: "721px" });
});


it("waits for the virtual render window before focusing Home and End targets", async () => {
  const large = Array.from({ length: 20000 }, (_, i) => ({ id: `n${i}`, name: `Node ${i}` }));
  render(<Tree nodes={large} maxHeight={400} />);
  const first = screen.getByRole("treeitem", { name: "Node 0", exact: true });
  act(() => first.focus());
  fireEvent.keyDown(first, { key: "End" });
  const last = await screen.findByRole("treeitem", { name: "Node 19999", exact: true });
  await waitFor(() => expect(last).toHaveFocus());
  fireEvent.keyDown(last, { key: "Home" });
  await waitFor(() => expect(screen.getByRole("treeitem", { name: "Node 0", exact: true })).toHaveFocus());
});
