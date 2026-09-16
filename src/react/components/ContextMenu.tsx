import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { TreeNode } from "../../core/types";
import type { ContextMenuItem } from "../libs/types";

export interface ContextMenuState<T> {
  x: number;
  y: number;
  node: TreeNode<T>;
  items: ContextMenuItem<T>[];
  anchor: HTMLElement;
}

/** Keep menus outside clipped trees and inside the active modal's top layer. */
export function ContextMenu<T>({ state, onClose }: {
  state: ContextMenuState<T>;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [position, setPosition] = useState({ left: state.x, top: state.y });
  const [tokens, setTokens] = useState<CSSProperties>({});
  const host = state.anchor.closest("dialog") ?? state.anchor.ownerDocument.body;

  useLayoutEffect(() => {
    const root = state.anchor.closest(".pde-tree-root") ?? state.anchor;
    const computed = getComputedStyle(root);
    const inherited: Record<string, string> = {};
    for (let i = 0; i < computed.length; i++) {
      const name = computed.item(i);
      if (name.startsWith("--tree-") || name.startsWith("--color-") || name.startsWith("--radius-") || name.startsWith("--font-") || name.startsWith("--shadow-")) inherited[name] = computed.getPropertyValue(name);
    }
    setTokens(inherited);
    const menu = menuRef.current;
    if (!menu) return;
    const positionMenu = () => {
      const rect = menu.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(state.x, document.documentElement.clientWidth - rect.width - 8)), top: Math.max(8, Math.min(state.y, document.documentElement.clientHeight - rect.height - 8)) });
    };
    positionMenu();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(positionMenu);
    observer?.observe(menu);
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target)) onClose();
    };
    const dismissScroll = (event: Event) => { if (event.target instanceof Node && !menu.contains(event.target)) onClose(); };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("scroll", dismissScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      observer?.disconnect();
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("scroll", dismissScroll, true);
      window.removeEventListener("resize", onClose);
      if (menu.contains(document.activeElement) && state.anchor.isConnected) state.anchor.focus({ preventScroll: true });
    };
  }, [state, onClose]);

  return createPortal(<div ref={menuRef} className="pde-tree-contextMenu" style={{ ...tokens, ...position }}
    role="menu" aria-label={`Actions for ${state.node.name}`} tabIndex={-1}
    onKeyDown={(event) => {
      const menu = menuRef.current;
      if (!menu) return;
      const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      let next: number;
      if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
      else if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[next]?.focus();
    }}>
    {state.items.map((item, index) => <div key={`${item.label}-${index}`} role="presentation">
      {item.separator && <div className="pde-tree-contextMenuSeparator" role="separator" />}
      <button type="button" role="menuitem" tabIndex={-1} disabled={item.disabled}
        className={`pde-tree-contextMenuItem${item.danger ? " pde-tree-contextMenuItemDanger" : ""}${confirming === index ? " pde-tree-contextMenuItemConfirming" : ""}`}
        onClick={() => {
          if (item.confirm && confirming !== index) { setConfirming(index); return; }
          onClose();
          item.onClick(state.node);
        }}>
        {item.icon && <span className="pde-tree-contextMenuIcon" aria-hidden="true">{item.icon}</span>}
        <span>{item.confirm && confirming === index ? item.confirmLabel ?? "Confirm?" : item.label}</span>
      </button>
    </div>)}
  </div>, host);
}
