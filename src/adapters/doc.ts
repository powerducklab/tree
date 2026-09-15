import type { Oas32Document } from "@powerduck/openapi-parser";

import type { TreeNode } from "../core/types";
import { sortNodes } from "../core/tree-utils";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Metadata attached to documentation tree nodes. */
export interface DocNodeMetadata {
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
  /** Description for rich text rendering. */
  description?: string;
  /** JSON pointer to the source object. */
  pointer?: string;
  /** Parameter location (query/path/header/cookie) for parameter nodes. */
  paramIn?: string;
  /** Whether a parameter is required. */
  required?: boolean;
  /** HTTP status code for response nodes. */
  statusCode?: string;
  /** Content type for media type nodes. */
  contentType?: string;
  /** Node kind for icon selection. */
  kind?: DocNodeKind;
  /** Source of the navigation grouping. */
  source?: "tag" | "tag-group" | "oas32-parent" | "fallback";
  /** Number of operations in this node's subtree (for count badges). */
  operationCount?: number;
}

export type DocNodeKind =
  | "root"
  | "tag-group"
  | "tag"
  | "operation"
  | "parameters"
  | "parameter"
  | "request-body"
  | "responses"
  | "response"
  | "content"
  | "webhook"
  | "component"
  | "schema"
  | "uncategorized";

export type DocTreeNode = TreeNode<DocNodeMetadata>;

/** Options for building the documentation tree. */
export interface DocTreeOptions {
  /** Show nodes marked with x-internal or x-scalar-ignore. Default false. */
  showInternal?: boolean;
  /** Include components/schemas section. Default true. */
  showComponents?: boolean;
  /** Include webhooks section. Default true. */
  showWebhooks?: boolean;
  /** Expand operation details (parameters, request body, responses). Default true. */
  expandOperationDetails?: boolean;
}

export interface DocTreeBuildResult {
  root: DocTreeNode;
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

const DEFAULT_OPTIONS: Required<DocTreeOptions> = {
  showInternal: false,
  showComponents: false,
  showWebhooks: true,
  expandOperationDetails: true,
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

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function getArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function isHidden(record: JsonRecord, showInternal: boolean): boolean {
  if (showInternal) {
    return false;
  }

  return (
    getBoolean(record["x-scalar-ignore"]) === true ||
    getBoolean(record["x-internal"]) === true
  );
}

function getOrder(record: JsonRecord): number | undefined {
  const order = record["x-order"];
  return typeof order === "number" && Number.isFinite(order)
    ? order
    : undefined;
}

function getDisplayName(record: JsonRecord): string | undefined {
  return getString(record["x-displayName"]);
}

/* -------------------------------------------------------------------------- */
/* Operation detail children                                                  */
/* -------------------------------------------------------------------------- */

function buildParameterNodes(
  parameters: unknown[],
  basePointer: string,
): DocTreeNode[] {
  const nodes: DocTreeNode[] = [];

  for (const rawParam of parameters) {
    const param = asRecord(rawParam);

    if (!param) {
      continue;
    }

    const name = getString(param.name);
    const location = getString(param.in);

    if (!name || !location) {
      continue;
    }

    const paramId = `${location}:${name}`;

    nodes.push({
      id: `${basePointer}/parameters/${encodeURIComponent(paramId)}`,
      name,
      metadata: {
        paramIn: location,
        required: getBoolean(param.required) === true,
        description: getString(param.description),
        pointer: `${basePointer}/parameters`,
        kind: "parameter",
      },
    });
  }

  return sortNodes(nodes);
}

function buildResponseNodes(
  responses: JsonRecord,
  basePointer: string,
): DocTreeNode[] {
  const nodes: DocTreeNode[] = [];

  for (const [statusCode, rawResponse] of Object.entries(responses)) {
    const response = asRecord(rawResponse);

    if (!response) {
      continue;
    }

    const description = getString(response.description);
    const content = asRecord(response.content);

    const contentChildren: DocTreeNode[] = [];

    if (content) {
      for (const [contentType] of Object.entries(content)) {
        contentChildren.push({
          id: `${basePointer}/responses/${encodeURIComponent(statusCode)}/content/${encodeURIComponent(contentType)}`,
          name: contentType,
          metadata: {
            contentType,
            pointer: `${basePointer}/responses/${encodeURIComponent(statusCode)}/content/${encodeURIComponent(contentType)}`,
            kind: "content",
          },
        });
      }
    }

    nodes.push({
      id: `${basePointer}/responses/${encodeURIComponent(statusCode)}`,
      name: statusCode,
      metadata: {
        statusCode,
        description,
        pointer: `${basePointer}/responses/${encodeURIComponent(statusCode)}`,
        kind: "response",
      },
      children: contentChildren.length > 0 ? contentChildren : undefined,
    });
  }

  return sortNodes(nodes);
}

function buildOperationDetailChildren(
  operation: JsonRecord,
  pointer: string,
): DocTreeNode[] {
  const children: DocTreeNode[] = [];

  /* Parameters */
  const parameters = getArray(operation.parameters);

  if (parameters?.length) {
    const parameterNodes = buildParameterNodes(parameters, pointer);

    if (parameterNodes.length > 0) {
      children.push({
        id: `${pointer}/parameters`,
        name: "Parameters",
        children: parameterNodes,
        metadata: {
          pointer: `${pointer}/parameters`,
          kind: "parameters",
        },
      });
    }
  }

  /* Request Body */
  const requestBody = asRecord(operation.requestBody);

  if (requestBody) {
    const content = asRecord(requestBody.content);
    const contentChildren: DocTreeNode[] = [];

    if (content) {
      for (const [contentType] of Object.entries(content)) {
        contentChildren.push({
          id: `${pointer}/requestBody/content/${encodeURIComponent(contentType)}`,
          name: contentType,
          metadata: {
            contentType,
            pointer: `${pointer}/requestBody/content/${encodeURIComponent(contentType)}`,
            kind: "content",
          },
        });
      }
    }

    children.push({
      id: `${pointer}/requestBody`,
      name: "Request Body",
      metadata: {
        description: getString(requestBody.description),
        required: getBoolean(requestBody.required) === true,
        pointer: `${pointer}/requestBody`,
        kind: "request-body",
      },
      children: contentChildren.length > 0 ? contentChildren : undefined,
    });
  }

  /* Responses */
  const responses = asRecord(operation.responses);

  if (responses) {
    const responseNodes = buildResponseNodes(responses, pointer);

    if (responseNodes.length > 0) {
      children.push({
        id: `${pointer}/responses`,
        name: "Responses",
        children: responseNodes,
        metadata: {
          pointer: `${pointer}/responses`,
          kind: "responses",
        },
      });
    }
  }

  return children;
}

/* -------------------------------------------------------------------------- */
/* Operation parsing                                                          */
/* -------------------------------------------------------------------------- */

interface ParsedDocOperation {
  id: string;
  path: string;
  method: string;
  name: string;
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated: boolean;
  tags: string[];
  pointer: string;
  raw: JsonRecord;
}

function parseDocOperations(document: JsonRecord): ParsedDocOperation[] {
  const paths = asRecord(document.paths);

  if (!paths) {
    return [];
  }

  const operations: ParsedDocOperation[] = [];

  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = asRecord(rawPathItem);

    if (!pathItem) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const rawOperation = pathItem[method];
      const operation = asRecord(rawOperation);

      if (!operation) {
        continue;
      }

      const operationId = getString(operation.operationId);
      const summary = getString(operation.summary);
      const description = getString(operation.description);
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
        description,
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
/* Tag definitions and nesting                                                */
/* -------------------------------------------------------------------------- */

interface TagDefinition {
  name: string;
  displayName: string;
  description?: string;
  parent?: string;
  order?: number;
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
    });
  }

  return definitions;
}

function hasOas32NestedTags(definitions: TagDefinition[]): boolean {
  return definitions.some((tag) => tag.parent !== undefined);
}

/* -------------------------------------------------------------------------- */
/* Operation node builder (shared)                                           */
/* -------------------------------------------------------------------------- */

function buildDocOperationNode(
  operation: ParsedDocOperation,
  options: Required<DocTreeOptions>,
  source: DocNodeMetadata["source"],
  tagPrefix: string,
): DocTreeNode {
  const children = options.expandOperationDetails
    ? buildOperationDetailChildren(operation.raw, operation.pointer)
    : undefined;

  return {
    id: `op:${tagPrefix}:${operation.id}`,
    name: operation.name,
    order: getOrder(operation.raw),
    metadata: {
      method: operation.method,
      path: operation.path,
      operationId: operation.operationId,
      deprecated: operation.deprecated,
      summary: operation.summary,
      description: operation.description,
      pointer: operation.pointer,
      source,
      kind: "operation",
    },
    children: children && children.length > 0 ? children : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* OAS 3.2 native parent nesting                                              */
/* -------------------------------------------------------------------------- */

function buildOas32NestedDocTree(
  definitions: TagDefinition[],
  operations: ParsedDocOperation[],
  options: Required<DocTreeOptions>,
  warnings: string[],
): DocTreeNode[] {
  const tagMap = new Map<string, TagDefinition>();

  for (const tag of definitions) {
    tagMap.set(tag.name, tag);
  }

  const validatedParents = new Map<string, string | null>();

  for (const tag of definitions) {
    if (!tag.parent) {
      validatedParents.set(tag.name, null);
      continue;
    }

    if (!tagMap.has(tag.parent)) {
      warnings.push(
        `Tag "${tag.name}" references unknown parent "${tag.parent}", treating as root.`,
      );
      validatedParents.set(tag.name, null);
      continue;
    }

    const chain = [tag.name];
    let current: string | undefined = tag.parent;
    let hasCycle = false;

    while (current) {
      if (chain.includes(current)) {
        hasCycle = true;
        warnings.push(
          `Circular tag reference detected: ${chain.join(" -> ")} -> ${current}. Breaking cycle.`,
        );
        break;
      }

      chain.push(current);
      current = tagMap.get(current)?.parent;
    }

    validatedParents.set(tag.name, hasCycle ? null : tag.parent);
  }

  const operationsByTag = new Map<string, ParsedDocOperation[]>();

  for (const operation of operations) {
    if (isHidden(operation.raw, options.showInternal)) {
      continue;
    }

    const tags = operation.tags.length > 0 ? operation.tags : ["Other"];

    for (const tag of tags) {
      const existing = operationsByTag.get(tag) ?? [];
      existing.push(operation);
      operationsByTag.set(tag, existing);
    }
  }

  const buildTagNode = (tag: TagDefinition): DocTreeNode => {
    const tagOperations = operationsByTag.get(tag.name) ?? [];

    const children: DocTreeNode[] = tagOperations.map((operation) =>
      buildDocOperationNode(operation, options, "oas32-parent", tag.name),
    );

    return {
      id: `tag:${tag.name}`,
      name: tag.displayName,
      order: tag.order,
      children: sortNodes(children),
      metadata: {
        description: tag.description,
        source: "oas32-parent",
        kind: "tag",
      },
    };
  };

  const childrenByParent = new Map<string, TagDefinition[]>();

  for (const tag of definitions) {
    const parent = validatedParents.get(tag.name) ?? null;
    const key = parent ?? "__root__";
    const existing = childrenByParent.get(key) ?? [];
    existing.push(tag);
    childrenByParent.set(key, existing);
  }

  const buildSubtree = (parentName: string): DocTreeNode[] => {
    const childTags = childrenByParent.get(parentName) ?? [];

    return sortNodes(
      childTags.map((tag) => {
        const node = buildTagNode(tag);
        const nestedChildren = buildSubtree(tag.name);

        if (nestedChildren.length > 0) {
          node.children = sortNodes([...(node.children ?? []), ...nestedChildren]);
        }

        return node;
      }),
    );
  };

  const rootTags = buildSubtree("__root__");

  const otherOperations = operationsByTag.get("Other") ?? [];

  if (otherOperations.length > 0) {
    const otherChildren: DocTreeNode[] = otherOperations.map((operation) =>
      buildDocOperationNode(operation, options, "fallback", "Other"),
    );

    rootTags.push({
      id: "tag:Other",
      name: "Other",
      order: Number.MAX_SAFE_INTEGER,
      children: sortNodes(otherChildren),
      metadata: {
        source: "fallback",
        kind: "tag",
      },
    });
  }

  return sortNodes(rootTags);
}

/* -------------------------------------------------------------------------- */
/* Flat tag grouping (fallback)                                               */
/* -------------------------------------------------------------------------- */

function buildFlatTagDocTree(
  definitions: TagDefinition[],
  operations: ParsedDocOperation[],
  options: Required<DocTreeOptions>,
): DocTreeNode[] {
  const operationsByTag = new Map<string, ParsedDocOperation[]>();
  const tagOrder = new Map<string, number>();

  for (let index = 0; index < definitions.length; index += 1) {
    tagOrder.set(definitions[index]!.name, index);
  }

  for (const operation of operations) {
    if (isHidden(operation.raw, options.showInternal)) {
      continue;
    }

    const tags = operation.tags.length > 0 ? operation.tags : ["Other"];

    for (const tag of tags) {
      const existing = operationsByTag.get(tag) ?? [];
      existing.push(operation);
      operationsByTag.set(tag, existing);
    }
  }

  const displayNames = new Map<string, string>();

  for (const tag of definitions) {
    displayNames.set(tag.name, tag.displayName);
  }

  const nodes: DocTreeNode[] = [];

  for (const [tag, tagOperations] of operationsByTag) {
    const children: DocTreeNode[] = tagOperations.map((operation) =>
      buildDocOperationNode(operation, options, "tag", tag),
    );

    nodes.push({
      id: `tag:${tag}`,
      name: displayNames.get(tag) ?? tag,
      order: tag === "Other" ? Number.MAX_SAFE_INTEGER : tagOrder.get(tag),
      children: sortNodes(children),
      metadata: {
        source: "tag",
        kind: "tag",
      },
    });
  }

  return sortNodes(nodes);
}

/* -------------------------------------------------------------------------- */
/* x-tagGroups navigation                                                      */
/* -------------------------------------------------------------------------- */

interface TagGroup {
  name: string;
  tags?: string[];
  groups?: TagGroup[];
}

function hasTagGroups(document: JsonRecord): boolean {
  return Array.isArray(document["x-tagGroups"]) && document["x-tagGroups"].length > 0;
}

function parseTagGroups(raw: unknown): TagGroup[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const groups: TagGroup[] = [];

  for (const item of raw) {
    const record = asRecord(item);

    if (!record || typeof record.name !== "string") {
      continue;
    }

    const group: TagGroup = { name: record.name };

    if (Array.isArray(record.tags)) {
      group.tags = record.tags.filter((t): t is string => typeof t === "string");
    }

    if (Array.isArray(record.groups)) {
      group.groups = parseTagGroups(record.groups);
    }

    groups.push(group);
  }

  return groups;
}

function buildTagGroupDocTree(
  group: TagGroup,
  operationsByTag: Map<string, ParsedDocOperation[]>,
  displayNames: Map<string, string>,
  tagOrder: Map<string, number>,
  options: Required<DocTreeOptions>,
  depth = 0,
): DocTreeNode {
  const children: DocTreeNode[] = [];

  /* Direct tags in this group. */
  if (group.tags) {
    for (const tag of group.tags) {
      const tagOperations = operationsByTag.get(tag);

      if (!tagOperations || tagOperations.length === 0) {
        continue;
      }

      const operationNodes = tagOperations.map((operation) =>
        buildDocOperationNode(operation, options, "tag-group", tag),
      );

      children.push({
        id: `tag:${tag}`,
        name: displayNames.get(tag) ?? tag,
        order: tagOrder.get(tag),
        children: sortNodes(operationNodes),
        metadata: { source: "tag-group", kind: "tag" },
      });
    }
  }

  /* Nested sub-groups. */
  if (group.groups) {
    for (const subGroup of group.groups) {
      children.push(
        buildTagGroupDocTree(
          subGroup,
          operationsByTag,
          displayNames,
          tagOrder,
          options,
          depth + 1,
        ),
      );
    }
  }

  return {
    id: `tag-group:${group.name}`,
    name: group.name,
    order: depth * 1000,
    children: sortNodes(children),
    metadata: { source: "tag-group", kind: "tag-group" },
  };
}

function buildTagGroupNavigation(
  document: JsonRecord,
  definitions: TagDefinition[],
  operations: ParsedDocOperation[],
  options: Required<DocTreeOptions>,
): DocTreeNode[] {
  const operationsByTag = new Map<string, ParsedDocOperation[]>();
  const tagOrder = new Map<string, number>();
  const displayNames = new Map<string, string>();

  for (let index = 0; index < definitions.length; index += 1) {
    tagOrder.set(definitions[index]!.name, index);
    displayNames.set(definitions[index]!.name, definitions[index]!.displayName);
  }

  for (const operation of operations) {
    if (isHidden(operation.raw, options.showInternal)) {
      continue;
    }

    const tags = operation.tags.length > 0 ? operation.tags : ["Other"];

    for (const tag of tags) {
      const existing = operationsByTag.get(tag) ?? [];
      existing.push(operation);
      operationsByTag.set(tag, existing);
    }
  }

  const groups = parseTagGroups(document["x-tagGroups"]);
  const nodes = groups.map((group) =>
    buildTagGroupDocTree(group, operationsByTag, displayNames, tagOrder, options),
  );

  /* Add untagged operations to "Other" at the end. */
  const otherOperations = operationsByTag.get("Other");

  if (otherOperations && otherOperations.length > 0) {
    const operationNodes = otherOperations.map((operation) =>
      buildDocOperationNode(operation, options, "fallback", "Other"),
    );

    nodes.push({
      id: "tag:Other",
      name: "Other",
      order: Number.MAX_SAFE_INTEGER,
      children: sortNodes(operationNodes),
      metadata: { source: "fallback", kind: "tag" },
    });
  }

  return sortNodes(nodes);
}

/* -------------------------------------------------------------------------- */
/* Components and webhooks                                                    */
/* -------------------------------------------------------------------------- */

function buildComponentsSection(
  document: JsonRecord,
  options: Required<DocTreeOptions>,
): DocTreeNode | undefined {
  if (!options.showComponents) {
    return undefined;
  }

  const components = asRecord(document.components);
  const schemas = asRecord(components?.schemas);

  if (!schemas) {
    return undefined;
  }

  const schemaNodes: DocTreeNode[] = [];

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
        description: getString(schema.description),
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
      source: "tag",
      kind: "component",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Builds a Stripe-style API documentation tree from an OpenAPI 3.x document.
 *
 * Unlike the debug navigation tree, this tree expands each operation to show
 * parameters, request body, and responses as child nodes — suitable for
 * documentation-style navigation.
 *
 * Navigation strategy (in priority order):
 * 1. OAS 3.2 native parent-nested tags
 * 2. Flat tag grouping (fallback)
 *
 * Supported extensions: x-order, x-displayName, x-internal, x-scalar-ignore.
 */
/**
 * Recursively counts operation nodes in each subtree and attaches
 * `metadata.operationCount` to every node for display badges.
 */
function addOperationCounts(nodes: DocTreeNode[]): DocTreeNode[] {
  return nodes.map((node) => {
    const children = node.children ? addOperationCounts(node.children) : undefined;
    const ownCount = node.metadata?.kind === "operation" ? 1 : 0;
    const childCount = children?.reduce((sum, child) => sum + (child.metadata?.operationCount ?? 0), 0) ?? 0;

    return {
      ...node,
      children,
      metadata: {
        ...node.metadata,
        operationCount: ownCount + childCount,
      },
    };
  });
}

export function buildDocTree(
  document: Oas32Document | Record<string, unknown> | null | undefined,
  options: DocTreeOptions = {},
): DocTreeBuildResult {
  const resolvedOptions: Required<DocTreeOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const warnings: string[] = [];
  const doc = asRecord(document);

  if (!doc) {
    return {
      root: {
        id: "root",
        name: "API Documentation",
        children: [],
        metadata: { kind: "root" },
      },
      warnings: ["Document is null or not an object."],
    };
  }

  const operations = parseDocOperations(doc);
  const definitions = parseTagDefinitions(doc);

  let navigationChildren: DocTreeNode[];

  if (hasOas32NestedTags(definitions)) {
    navigationChildren = buildOas32NestedDocTree(
      definitions,
      operations,
      resolvedOptions,
      warnings,
    );
  } else if (hasTagGroups(doc)) {
    navigationChildren = buildTagGroupNavigation(
      doc,
      definitions,
      operations,
      resolvedOptions,
    );
  } else {
    navigationChildren = buildFlatTagDocTree(
      definitions,
      operations,
      resolvedOptions,
    );
  }

  const componentsSection = buildComponentsSection(doc, resolvedOptions);

  const allChildren = addOperationCounts([
    ...navigationChildren,
    ...(componentsSection ? [componentsSection] : []),
  ]);

  return {
    root: {
      id: "root",
      name: "API Documentation",
      children: sortNodes(allChildren),
      metadata: { kind: "root" },
    },
    warnings,
  };
}
