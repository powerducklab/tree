import { buildTagHierarchy } from "./tag-hierarchy";
import type { Oas32Document } from "@powerduck/openapi-parser";

import type { TreeNode } from "../core/types";
import { sortNodes } from "../core/tree-utils";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Metadata attached to OpenAPI tree nodes. */
export interface OpenApiNodeMetadata {
  /** HTTP method for operation nodes. */
  method?: string;
  /** API path for operation and path nodes. */
  path?: string;
  /** operationId for operation nodes. */
  operationId?: string;
  /** Whether the operation is deprecated. */
  deprecated?: boolean;
  /** Short summary for display. */
  summary?: string;
  /** JSON pointer to the source object in the document. */
  pointer?: string;
  /** Source of the navigation grouping. */
  source?: "tag" | "tag-group" | "oas32-parent" | "fallback" | "section";
  /** Node kind for icon selection. */
  kind?: OpenApiNodeKind;
  /** Drag group isolation key (e.g. "apis", "components", "webhooks"). */
  section?: string;
}

export type OpenApiNodeKind =
  | "root"
  | "section"
  | "tag-group"
  | "tag"
  | "path"
  | "operation"
  | "webhook"
  | "component"
  | "schema"
  | "uncategorized";

export type OpenApiTreeNode = TreeNode<OpenApiNodeMetadata>;

/** Options for building the OpenAPI navigation tree. */
export interface OpenApiTreeOptions {
  /** Show nodes marked with x-internal or x-scalar-ignore. Default false. */
  showInternal?: boolean;
  /** Include components/schemas section. Default true. */
  showComponents?: boolean;
  /** Include webhooks section. Default true. */
  showWebhooks?: boolean;
  /** Maximum depth to expand. Default 2 (group -> tag -> operation). */
  defaultExpandDepth?: number;
}

export interface OpenApiTreeBuildResult {
  root: OpenApiTreeNode;
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

const DEFAULT_OPTIONS: Required<OpenApiTreeOptions> = {
  showInternal: false,
  showComponents: true,
  showWebhooks: true,
  defaultExpandDepth: 2,
};

/* -------------------------------------------------------------------------- */
/* Low-level helpers                                                          */
/* -------------------------------------------------------------------------- */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function getArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

/** Checks if a node should be hidden based on x-internal / x-scalar-ignore. */
function isHidden(record: JsonRecord, showInternal: boolean): boolean {
  if (showInternal) {
    return false;
  }

  return (
    getBoolean(record["x-scalar-ignore"]) === true ||
    getBoolean(record["x-internal"]) === true
  );
}

/** Gets the x-order value from a record. */
function getOrder(record: JsonRecord): number | undefined {
  return getNumber(record["x-order"]);
}

/** Gets the x-displayName from a tag record. */
function getDisplayName(record: JsonRecord): string | undefined {
  return getString(record["x-displayName"]);
}

/* -------------------------------------------------------------------------- */
/* Operation parsing                                                          */
/* -------------------------------------------------------------------------- */

interface ParsedOperation {
  id: string;
  path: string;
  method: string;
  name: string;
  summary?: string;
  operationId?: string;
  deprecated: boolean;
  tags: string[];
  pointer: string;
  raw: JsonRecord;
}

function parseOperations(document: JsonRecord): ParsedOperation[] {
  const paths = asRecord(document.paths);

  if (!paths) {
    return [];
  }

  const operations: ParsedOperation[] = [];

  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = asRecord(rawPathItem);

    if (!pathItem) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const rawOperation = pathItem[method];

      if (rawOperation === undefined || rawOperation === null) {
        continue;
      }

      const operation = asRecord(rawOperation);

      if (!operation) {
        continue;
      }

      const operationId = getString(operation.operationId);
      const summary = getString(operation.summary);
      const tags = getArray(operation.tags)
        ?.filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0) ?? [];

      const name = summary ?? operationId ?? `${method.toUpperCase()} ${path}`;
      const id = operationId ?? `${method}:${path}`;
      const pointer = `/paths/${encodeURIComponent(path)}/${method}`;

      operations.push({
        id,
        path,
        method,
        name,
        summary,
        operationId,
        deprecated: getBoolean(operation.deprecated) === true,
        tags,
        pointer,
        raw: operation,
      });
    }
  }

  return operations;
}

/* -------------------------------------------------------------------------- */
/* OAS 3.2 native parent nesting                                              */
/* -------------------------------------------------------------------------- */

interface TagDefinition {
  name: string;
  displayName: string;
  description?: string;
  parent?: string;
  order?: number;
  raw: JsonRecord;
}

function parseTagDefinitions(document: JsonRecord): TagDefinition[] {
  const tags = getArray(document.tags);

  if (!tags) {
    return [];
  }

  const definitions: TagDefinition[] = [];

  for (const rawTag of tags) {
    const tag = asRecord(rawTag);
    const name = getString(tag?.name);

    if (!name || !tag) {
      continue;
    }

    definitions.push({
      name,
      displayName: getDisplayName(tag) ?? name,
      description: getString(tag.description),
      parent: getString(tag.parent),
      order: getOrder(tag),
      raw: tag,
    });
  }

  return definitions;
}

/**
 * Detects whether the document uses OAS 3.2 native parent nesting.
 * Returns true if at least one tag has a parent field.
 */
function hasOas32NestedTags(definitions: TagDefinition[]): boolean {
  return definitions.some((tag) => tag.parent !== undefined);
}

/**
 * Builds a tree from OAS 3.2 native parent-nested tags.
 *
 * Tags are flattened in the document's tags array and reference their
 * parent by name. This function resolves the hierarchy, detects circular
 * references, and attaches operations to their tags.
 */
/* Operations without a tag render directly under the APIs root instead of
   being collected into a synthetic "Other" folder. */
function buildRootOperationNode(
  operation: ParsedOperation,
): OpenApiTreeNode {
  return {
    id: `op:root:${operation.id}`,
    name: operation.name,
    order: getOrder(operation.raw),
    metadata: {
      method: operation.method,
      path: operation.path,
      operationId: operation.operationId,
      deprecated: operation.deprecated,
      summary: operation.summary,
      pointer: operation.pointer,
      source: "fallback",
      kind: "operation",
    },
  };
}

function buildOas32NestedTree(
  definitions: TagDefinition[],
  operations: ParsedOperation[],
  options: Required<OpenApiTreeOptions>,
  warnings: string[],
): OpenApiTreeNode[] {
  const operationsByTag = new Map<string, ParsedOperation[]>();
  const untagged: ParsedOperation[] = [];

  for (const operation of operations) {
    if (isHidden(operation.raw, options.showInternal)) {
      continue;
    }

    if (operation.tags.length === 0) {
      untagged.push(operation);
      continue;
    }

    for (const tag of operation.tags) {
      const existing = operationsByTag.get(tag) ?? [];
      existing.push(operation);
      operationsByTag.set(tag, existing);
    }
  }

  /* Build tag nodes. */
  const buildTagNode = (tag: TagDefinition): OpenApiTreeNode => {
    const tagOperations = operationsByTag.get(tag.name) ?? [];

    const children: OpenApiTreeNode[] = tagOperations.map((operation) => ({
      id: `op:${tag.name}:${operation.id}`,
      name: operation.name,
      order: getOrder(operation.raw),
      metadata: {
        method: operation.method,
        path: operation.path,
        operationId: operation.operationId,
        deprecated: operation.deprecated,
        summary: operation.summary,
        pointer: operation.pointer,
        source: "oas32-parent",
        kind: "operation",
      },
    }));

    return {
      id: `tag:${tag.name}`,
      name: tag.displayName,
      order: tag.order,
      children: sortNodes(children),
      metadata: {
        source: "oas32-parent",
        kind: "tag",
      },
    };
  };

  /* Build parent-child map. */
  const definedNames = new Set(definitions.map((tag) => tag.name));
  const allDefinitions = [...definitions];
  for (const name of operationsByTag.keys()) {
    if (!definedNames.has(name)) allDefinitions.push({ name, displayName: name, raw: {} });
  }
  const rootTags = buildTagHierarchy(allDefinitions, buildTagNode, warnings);

  /* Attach untagged operations directly at the APIs root; no synthetic folder. */
  return sortNodes([...rootTags, ...untagged.map(buildRootOperationNode)]);
}

/* -------------------------------------------------------------------------- */
/* x-tagGroups nesting                                                        */
/* -------------------------------------------------------------------------- */

interface TagGroup {
  name: string;
  tags: string[];
  groups?: TagGroup[];
  order?: number;
}

function parseTagGroups(document: JsonRecord): TagGroup[] {
  const rawGroups = getArray(document["x-tagGroups"]);

  if (!rawGroups) {
    return [];
  }

  const parseGroup = (value: unknown, index: number): TagGroup | null => {
    const group = asRecord(value);
    const name = getString(group?.name);
    const tags = getArray(group?.tags)
      ?.filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0) ?? [];

    if (!name) {
      return null;
    }

    const nestedGroups = getArray(group?.groups)
      ?.map((nested, nestedIndex) => parseGroup(nested, nestedIndex))
      .filter((group): group is TagGroup => group !== null) ?? [];

    return {
      name,
      tags,
      groups: nestedGroups.length > 0 ? nestedGroups : undefined,
      order: getOrder(group ?? {}) ?? index,
    };
  };

  return rawGroups
    .map((group, index) => parseGroup(group, index))
    .filter((group): group is TagGroup => group !== null);
}

/**
 * Builds a tree from x-tagGroups, supporting nested groups via the
 * powerduck-specific `groups` field.
 *
 * Tags not assigned to any group are not displayed (matching Redoc behavior).
 */
function buildTagGroupsTree(
  groups: TagGroup[],
  definitions: TagDefinition[],
  operations: ParsedOperation[],
  options: Required<OpenApiTreeOptions>,
): OpenApiTreeNode[] {
  const displayNames = new Map<string, string>();

  for (const tag of definitions) {
    displayNames.set(tag.name, tag.displayName);
  }

  const operationsByTag = new Map<string, ParsedOperation[]>();
  const untagged: ParsedOperation[] = [];

  for (const operation of operations) {
    if (isHidden(operation.raw, options.showInternal)) {
      continue;
    }

    if (operation.tags.length === 0) {
      untagged.push(operation);
      continue;
    }

    for (const tag of operation.tags) {
      const existing = operationsByTag.get(tag) ?? [];
      existing.push(operation);
      operationsByTag.set(tag, existing);
    }
  }

  const buildOperationNodes = (tag: string): OpenApiTreeNode[] => {
    const tagOperations = operationsByTag.get(tag) ?? [];

    return tagOperations.map((operation) => ({
      id: `op:${tag}:${operation.id}`,
      name: operation.name,
      order: getOrder(operation.raw),
      metadata: {
        method: operation.method,
        path: operation.path,
        operationId: operation.operationId,
        deprecated: operation.deprecated,
        summary: operation.summary,
        pointer: operation.pointer,
        source: "tag-group",
        kind: "operation",
      },
    }));
  };

  const buildTagNode = (tag: string): OpenApiTreeNode => ({
    id: `tag:${tag}`,
    name: displayNames.get(tag) ?? tag,
    children: sortNodes(buildOperationNodes(tag)),
    metadata: {
      source: "tag-group",
      kind: "tag",
    },
  });

  const buildGroupNode = (group: TagGroup): OpenApiTreeNode => {
    const children: OpenApiTreeNode[] = [];

    for (const tag of group.tags) {
      const tagOperations = operationsByTag.get(tag);

      if (!tagOperations?.length) {
        continue;
      }

      children.push(buildTagNode(tag));
    }

    for (const nestedGroup of group.groups ?? []) {
      children.push(buildGroupNode(nestedGroup));
    }

    return {
      id: `tag-group:${group.name}`,
      name: group.name,
      order: group.order,
      children: sortNodes(children),
      metadata: {
        source: "tag-group",
        kind: "tag-group",
      },
    };
  };

  return sortNodes([
    ...groups.map(buildGroupNode),
    ...untagged.map(buildRootOperationNode),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Flat tag grouping (fallback)                                               */
/* -------------------------------------------------------------------------- */

function buildFlatTagTree(
  definitions: TagDefinition[],
  operations: ParsedOperation[],
  options: Required<OpenApiTreeOptions>,
): OpenApiTreeNode[] {
  const operationsByTag = new Map<string, ParsedOperation[]>();
  const untagged: ParsedOperation[] = [];
  /* Use x-order when set, fall back to definition index for stable ordering. */
  const tagOrder = new Map<string, number>();

  for (let index = 0; index < definitions.length; index += 1) {
    const def = definitions[index]!;
    tagOrder.set(def.name, def.order ?? index);
  }

  for (const operation of operations) {
    if (isHidden(operation.raw, options.showInternal)) {
      continue;
    }

    if (operation.tags.length === 0) {
      untagged.push(operation);
      continue;
    }

    for (const tag of operation.tags) {
      const existing = operationsByTag.get(tag) ?? [];
      existing.push(operation);
      operationsByTag.set(tag, existing);
    }
  }

  const displayNames = new Map<string, string>();

  for (const tag of definitions) {
    displayNames.set(tag.name, tag.displayName);
  }

  const nodes: OpenApiTreeNode[] = [];

  for (const [tag, tagOperations] of operationsByTag) {
    const children: OpenApiTreeNode[] = tagOperations.map((operation) => ({
      id: `op:${tag}:${operation.id}`,
      name: operation.name,
      order: getOrder(operation.raw),
      metadata: {
        method: operation.method,
        path: operation.path,
        operationId: operation.operationId,
        deprecated: operation.deprecated,
        summary: operation.summary,
        pointer: operation.pointer,
        source: "tag",
        kind: "operation",
      },
    }));

    nodes.push({
      id: `tag:${tag}`,
      name: displayNames.get(tag) ?? tag,
      order: tagOrder.get(tag),
      children: sortNodes(children),
      metadata: {
        source: "tag",
        kind: "tag",
      },
    });
  }

  return sortNodes([...nodes, ...untagged.map(buildRootOperationNode)]);
}

/* -------------------------------------------------------------------------- */
/* Components and webhooks sections                                           */
/* -------------------------------------------------------------------------- */

function buildComponentsSection(
  document: JsonRecord,
  options: Required<OpenApiTreeOptions>,
): OpenApiTreeNode | undefined {
  if (!options.showComponents) {
    return undefined;
  }

  const components = asRecord(document.components);
  const schemas = asRecord(components?.schemas);

  if (!schemas) {
    return undefined;
  }

  const schemaNodes: OpenApiTreeNode[] = [];

  for (const [name, rawSchema] of Object.entries(schemas)) {
    const schema = asRecord(rawSchema);

    if (!schema || isHidden(schema, options.showInternal)) {
      continue;
    }

    schemaNodes.push({
      id: `schema:${name}`,
      name,
      order: getOrder(schema),
      metadata: {
        pointer: `/components/schemas/${encodeURIComponent(name)}`,
        source: "tag",
        kind: "schema",
      },
    });
  }

  if (schemaNodes.length === 0) {
    return undefined;
  }

  return {
    id: "section:components",
    name: "Components",
    order: Number.MAX_SAFE_INTEGER - 1,
    children: sortNodes(schemaNodes),
    metadata: {
      source: "section",
      kind: "section",
      section: "components",
    },
  };
}

function buildWebhooksSection(
  document: JsonRecord,
  options: Required<OpenApiTreeOptions>,
): OpenApiTreeNode | undefined {
  if (!options.showWebhooks) {
    return undefined;
  }

  const webhooks = asRecord(document.webhooks);

  if (!webhooks) {
    return undefined;
  }

  const webhookNodes: OpenApiTreeNode[] = [];

  for (const [name, rawPathItem] of Object.entries(webhooks)) {
    const pathItem = asRecord(rawPathItem);

    if (!pathItem) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const rawOperation = pathItem[method];
      const operation = asRecord(rawOperation);

      if (!operation || isHidden(operation, options.showInternal)) {
        continue;
      }

      const operationId = getString(operation.operationId);
      const summary = getString(operation.summary);
      const displayName = summary ?? operationId ?? `${method.toUpperCase()} ${name}`;

      webhookNodes.push({
        id: `webhook:${name}:${method}`,
        name: displayName,
        order: getOrder(operation),
        metadata: {
          method,
          path: name,
          operationId,
          deprecated: getBoolean(operation.deprecated) === true,
          summary,
          pointer: `/webhooks/${encodeURIComponent(name)}/${method}`,
          source: "tag",
          kind: "webhook",
        },
      });
    }
  }

  if (webhookNodes.length === 0) {
    return undefined;
  }

  return {
    id: "section:webhooks",
    name: "Webhooks",
    order: Number.MAX_SAFE_INTEGER - 2,
    children: sortNodes(webhookNodes),
    metadata: {
      source: "section",
      kind: "section",
      section: "webhooks",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Builds an OpenAPI navigation tree from an OpenAPI 3.x document.
 *
 * Navigation strategy (in priority order):
 * 1. OAS 3.2 native parent-nested tags (when any tag has a `parent` field)
 * 2. x-tagGroups (with powerduck nested `groups` extension)
 * 3. Flat tag grouping (fallback)
 *
 * Supported extensions: x-order, x-displayName, x-internal, x-scalar-ignore,
 * x-tagGroups (with nested groups).
 */
export function buildOpenApiTree(
  document: Oas32Document | Record<string, unknown> | null | undefined,
  options: OpenApiTreeOptions = {},
): OpenApiTreeBuildResult {
  const resolvedOptions: Required<OpenApiTreeOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const warnings: string[] = [];
  const doc = asRecord(document);

  if (!doc) {
    return {
      root: {
        id: "root",
        name: "OpenAPI",
        children: [],
        metadata: { kind: "root" },
      },
      warnings: ["Document is null or not an object."],
    };
  }

  const operations = parseOperations(doc);
  const definitions = parseTagDefinitions(doc);

  let navigationChildren: OpenApiTreeNode[];

  if (hasOas32NestedTags(definitions)) {
    navigationChildren = buildOas32NestedTree(
      definitions,
      operations,
      resolvedOptions,
      warnings,
    );
  } else {
    const tagGroups = parseTagGroups(doc);

    if (tagGroups.length > 0) {
      navigationChildren = buildTagGroupsTree(
        tagGroups,
        definitions,
        operations,
        resolvedOptions,
      );
    } else {
      navigationChildren = buildFlatTagTree(
        definitions,
        operations,
        resolvedOptions,
      );
    }
  }

  const webhooksSection = buildWebhooksSection(doc, resolvedOptions);
  const componentsSection = buildComponentsSection(doc, resolvedOptions);

  /* Wrap all API navigation under a top-level "APIs" section. */
  const apisSection: OpenApiTreeNode = {
    id: "section:apis",
    name: "APIs",
    children: navigationChildren,
    metadata: { kind: "section", source: "section", section: "apis" },
    order: 0,
  };

  const allChildren = [
    apisSection,
    ...(webhooksSection ? [webhooksSection] : []),
    ...(componentsSection ? [componentsSection] : []),
  ];

  return {
    root: {
      id: "root",
      name: "OpenAPI",
      children: sortNodes(allChildren),
      metadata: { kind: "root" },
    },
    warnings,
  };
}
