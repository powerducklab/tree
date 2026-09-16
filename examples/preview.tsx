import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { LuMoon, LuSun, LuCopy, LuPencil, LuTrash2 } from "react-icons/lu";
import { Tree } from "../src/react/Tree";
import { buildDocTree } from "../src/adapters/doc";
import { buildSchemaTree } from "../src/adapters/json-schema";
import type { TreeNode } from "../src/core/types";
import "./preview.css";

const api = {
  openapi: "3.2.0", info: { title: "Commerce API", version: "1.0.0" },
  tags: [{ name: "Customers" }, { name: "Payments" }, { name: "Products" }],
  paths: Object.fromEntries(["customers", "payments", "products"].flatMap((resource) => [
    [`/${resource}`, {
      get: { summary: `List ${resource}`, tags: [resource[0]!.toUpperCase() + resource.slice(1)], responses: { "200": { description: "Success" } } },
      post: { summary: `Create a ${resource.slice(0, -1)}`, tags: [resource[0]!.toUpperCase() + resource.slice(1)], responses: { "201": { description: "Created" } } },
    }],
    [`/${resource}/{id}`, {
      get: { summary: `Retrieve a ${resource.slice(0, -1)}`, tags: [resource[0]!.toUpperCase() + resource.slice(1)], responses: { "200": { description: "Success" } } },
      delete: { summary: `Delete a ${resource.slice(0, -1)}`, tags: [resource[0]!.toUpperCase() + resource.slice(1)], responses: { "204": { description: "Deleted" } } },
    }],
  ])),
};
const files: TreeNode[] = [
  { id: "src", name: "src", children: [
    { id: "components", name: "components", children: [{ id: "Button", name: "Button.tsx" }, { id: "Input", name: "Input.tsx" }, { id: "Tree", name: "Tree.tsx" }] },
    { id: "hooks", name: "hooks", children: [{ id: "useSearch", name: "useSearch.ts" }] },
    { id: "index", name: "index.ts" },
  ] },
  { id: "tests", name: "tests", children: [{ id: "test", name: "navigation.test.tsx" }] },
  { id: "package", name: "package.json" },
  { id: "readme", name: "README.md" },
];
const schema = buildSchemaTree({ title: "Customer", type: "object", required: ["id", "email"], properties: {
  id: { type: "string", format: "uuid" }, email: { type: "string", format: "email" }, name: { type: "string" },
  address: { type: "object", properties: { city: { type: "string" }, country: { type: "string" }, postal_code: { type: "string" } } },
  subscriptions: { type: "array", items: { type: "object", properties: { status: { type: "string" }, price: { type: "number" } } } },
} }).root;
const docs = buildDocTree(api, { expandOperationDetails: false }).root.children ?? [];

function Preview() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [status, setStatus] = useState("Select an item to explore.");
  const [fileNodes, setFileNodes] = useState(files);
  const [large, setLarge] = useState(false);
  const largeNodes = useMemo(() => Array.from({ length: 20000 }, (_, i) => ({ id: `item-${i}`, name: `Resource ${String(i + 1).padStart(5, "0")}` })), []);
  return <main data-theme={theme}>
    <header><a href="#" className="brand"><span className="brand-mark">P</span> powerduck <span className="brand-divider">/</span> <span>Tree</span></a>
      <button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? <LuMoon /> : <LuSun />}</button></header>
    <section className="intro"><span className="eyebrow">NAVIGATION, CONSIDERED</span><h1>A place for every detail.</h1><p>Explore APIs, browse a workspace, and navigate structured data.<br />One consistent experience, from a few items to thousands.</p></section>
    <section className="showcase" aria-label="Tree examples">
      <article><div className="panel-heading"><span className="panel-number">01</span><div><h2>API reference</h2><p>Clear paths. Familiar methods.</p></div><span className="panel-badge">12 endpoints</span></div><div className="tree-demo"><Tree nodes={docs} theme={theme} variant="doc" searchable defaultExpandDepth={3} onSelect={(n) => setStatus(`Selected: ${n.name}`)} /></div></article>
      <article><div className="panel-heading"><span className="panel-number">02</span><div><h2>Workspace</h2><p>Everything in its right place.</p></div></div><div className="tree-demo"><Tree nodes={fileNodes} theme={theme} searchable showExpandAll defaultExpandDepth={3} draggable onReorder={(result) => setFileNodes(result.nodes)} onMove={setFileNodes} onSelect={(n) => setStatus(`Selected: ${n.name}`)} contextMenuItems={(node) => [
        { label: "Copy name", icon: <LuCopy />, onClick: () => { void navigator.clipboard.writeText(node.name).then(() => setStatus(`Copied ${node.name}`), () => setStatus("Copy unavailable")); } },
        { label: "Inspect item", icon: <LuPencil />, onClick: () => setStatus(`Inspecting: ${node.name}`) },
        { label: "Remove item", icon: <LuTrash2 />, danger: true, separator: true, confirm: true, confirmLabel: "Confirm removal", onClick: () => setStatus(`Removal requested: ${node.name}`) },
      ]} /></div></article>
      <article><div className="panel-heading"><span className="panel-number">03</span><div><h2>{large ? "Large collection" : "Customer schema"}</h2><p>{large ? "20,000 items. Ready to browse." : "Structure without the noise."}</p></div></div><div className="tree-demo"><Tree key={String(large)} nodes={large ? largeNodes : schema.children ?? []} theme={theme} variant="schema" searchable showExpandAll defaultExpandDepth={2} onSelect={(n) => setStatus(`Selected: ${n.name}`)} /></div></article>
    </section>
    <footer><p role="status">{status}</p><button onClick={() => setLarge(!large)}>{large ? "Show customer schema" : "Explore 20,000 items"}</button></footer>
    <p className="keyboard-hint">Use arrow keys to navigate. Enter to select. Shift + F10 for workspace actions.</p>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
