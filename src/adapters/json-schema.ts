import type { TreeNode } from "../core/types";
import { sortNodes } from "../core/tree-utils";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Conventional field order for OAS / JSON Schema documents.
 * Known fields appear first in this order; unknown fields follow alphabetically. */
const FIELD_ORDER: Record<string, number> = {
  openapi: 0,
  info: 1,
  servers: 2,
  paths: 3,
  webhooks: 4,
  components: 5,
  security: 6,
  tags: 7,
  externalDocs: 8,
  jsonSchemaDialect: 9,
};

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Metadata attached to JSON Schema tree nodes. */
export interface SchemaNodeMetadata {
  /** JSON path segments from root to this node. */
  jsonPath: string[];
  /** Schema type (string, object, array, etc.). May be an array for multi-type. */
  type?: string | string[];
  /** Format hint (email, date-time, etc.). */
  format?: string;
  /** Whether this property is required in its parent object. */
  required?: boolean;
  /** Whether this schema is deprecated. */
  deprecated?: boolean;
  /** Short description. */
  description?: string;
  /** Whether this is a leaf (no children to expand). */
  isLeaf?: boolean;
  /** Node kind for icon selection. */
  kind?: SchemaNodeKind;
  /** For array nodes, whether items are defined. */
  hasItems?: boolean;
}

export type SchemaNodeKind =
  | "root"
  | "object"
  | "property"
  | "array"
  | "items"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "enum"
  | "anyOf"
  | "oneOf"
  | "allOf"
  | "ref"
  | "unknown";

export type SchemaTreeNode = TreeNode<SchemaNodeMetadata>;

/** Options for building the JSON Schema tree. */
export interface SchemaTreeOptions {
  /** Maximum recursion depth. Default 8. Prevents infinite loops on circular schemas. */
  maxDepth?: number;
  /** Maximum generated nodes, including combinator groups. Default 10,000. */
  maxNodes?: number;
  /** Include deprecated properties. Default true. */
  showDeprecated?: boolean;
  /** Expand allOf/anyOf/oneOf branches. Default true. */
  expandCombinators?: boolean;
  /** Show array items as a child node. Default true. */
  showArrayItems?: boolean;
}

export interface SchemaTreeBuildResult {
  root: SchemaTreeNode;
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_OPTIONS: Required<SchemaTreeOptions> = {
  maxDepth: 8,
  maxNodes: 10000,
  showDeprecated: true,
  expandCombinators: true,
  showArrayItems: true,
};

const SCALAR_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

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

function getType(schema: JsonRecord): string | string[] | undefined {
  const type = schema.type;

  if (typeof type === "string") {
    return type;
  }

  if (Array.isArray(type) && type.every((t) => typeof t === "string")) {
    return type as string[];
  }

  return undefined;
}

function isScalarType(type: string | string[] | undefined): boolean {
  if (!type) {
    return false;
  }

  if (Array.isArray(type)) {
    return type.every((t) => SCALAR_TYPES.has(t));
  }

  return SCALAR_TYPES.has(type);
}

function kindFromType(type: string | string[] | undefined): SchemaNodeKind {
  if (!type) {
    return "unknown";
  }

  const singleType = Array.isArray(type) ? type[0] : type;

  switch (singleType) {
    case "object":
      return "object";
    case "array":
      return "array";
    case "string":
      return "string";
    case "number":
      return "number";
    case "integer":
      return "integer";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    default:
      return "unknown";
  }
}

function formatTypeLabel(type: string | string[] | undefined): string {
  if (!type) {
    return "any";
  }

  if (Array.isArray(type)) {
    return type.join(" | ");
  }

  return type;
}

/* -------------------------------------------------------------------------- */
/* Schema tree building                                                       */
/* -------------------------------------------------------------------------- */

interface BuildContext {
  options: Required<SchemaTreeOptions>;
  warnings: string[];
  /** Tracks $ref paths to detect circular references. */
  refStack: Set<string>;
  activeSchemas: Set<JsonRecord>;
  remaining: number;
}

function schemaNodeId(path: string[]): string {
  return path.map((segment) => segment.replace(/[\\.\[\]]/g, (character) => `\\${character}`)).join(".") || "root";
}

function buildSchemaNode(
  name: string,
  schema: JsonRecord,
  jsonPath: string[],
  depth: number,
  context: BuildContext,
  required: boolean,
): SchemaTreeNode {
  context.remaining--;
  const type = getType(schema);
  const format = getString(schema.format);
  const description = getString(schema.description);
  const deprecated = getBoolean(schema.deprecated) === true;
  const kind = kindFromType(type);

  const baseMetadata: SchemaNodeMetadata = {
    jsonPath,
    type,
    format,
    required,
    deprecated,
    description,
    kind,
  };

  /* $ref handling */
  const ref = getString(schema.$ref);

  if (ref) {
    if (context.refStack.has(ref)) {
      context.warnings.push(
        `Circular $ref detected at ${jsonPath.join(".")}: ${ref}. Breaking recursion.`,
      );

      return {
        id: schemaNodeId(jsonPath),
        name,
        metadata: {
          ...baseMetadata,
          kind: "ref",
          isLeaf: true,
        },
      };
    }

    context.refStack.add(ref);
  }

  let children: SchemaTreeNode[] | undefined;
  let isLeaf = isScalarType(type);

  /* Bound cycles, depth, and total work independently. */
  const circular = context.activeSchemas.has(schema);
  if (circular) context.warnings.push(`Circular schema object detected at ${schemaNodeId(jsonPath)}.`);
  if (circular || depth >= context.options.maxDepth || context.remaining <= 0) {
    if (ref) {
      context.refStack.delete(ref);
    }

    return {
      id: schemaNodeId(jsonPath),
      name,
      metadata: {
        ...baseMetadata,
        isLeaf: true,
      },
    };
  }

  context.activeSchemas.add(schema);

  /* Object properties */
  const properties = asRecord(schema.properties);

  if (properties) {
    const requiredArray = getArray(schema.required) ?? [];
    const requiredSet = new Set(
      requiredArray.filter((r): r is string => typeof r === "string"),
    );

    const propertyNodes: SchemaTreeNode[] = [];

    for (const [propName, propSchema] of Object.entries(properties)) {
      if (context.remaining <= 0) break;
      const propRecord = asRecord(propSchema);

      if (!propRecord) {
        continue;
      }

      if (!context.options.showDeprecated && getBoolean(propRecord.deprecated) === true) {
        continue;
      }

      propertyNodes.push(
        buildSchemaNode(
          propName,
          propRecord,
          [...jsonPath, "properties", propName],
          depth + 1,
          context,
          requiredSet.has(propName),
        ),
      );
    }

    children = [...(children ?? []), ...sortNodes(propertyNodes)];
    isLeaf = false;
  }

  /* Array items */
  if (context.remaining > 0 && context.options.showArrayItems && type === "array") {
    const items = asRecord(schema.items);

    if (items) {
      const itemsNode = buildSchemaNode(
        "items",
        items,
        [...jsonPath, "items"],
        depth + 1,
        context,
        false,
      );

      children = [...(children ?? []), itemsNode];
      isLeaf = false;
    } else {
      baseMetadata.hasItems = false;
    }
  }

  /* Combinators: allOf / anyOf / oneOf */
  if (context.options.expandCombinators) {
    const combinators: Array<{ key: "allOf" | "anyOf" | "oneOf"; kind: SchemaNodeKind }> = [
      { key: "allOf", kind: "allOf" },
      { key: "anyOf", kind: "anyOf" },
      { key: "oneOf", kind: "oneOf" },
    ];

    for (const { key, kind } of combinators) {
      if (context.remaining <= 0) break;
      const schemas = getArray(schema[key]);

      if (!schemas?.length) {
        continue;
      }

      context.remaining--;
      const branchNodes: SchemaTreeNode[] = [];
      for (let index = 0; index < schemas.length && context.remaining > 0; index++) {
        const branch = schemas[index];
        const branchRecord = asRecord(branch);

        if (!branchRecord) {
          context.remaining--;
          branchNodes.push({
            id: schemaNodeId([...jsonPath, key, String(index)]),
            name: `[${index}]`,
            metadata: {
              jsonPath: [...jsonPath, key, String(index)],
              kind: "unknown",
              isLeaf: true,
            },
          });
          continue;
        }

        branchNodes.push(buildSchemaNode(
          `[${index}]`,
          branchRecord,
          [...jsonPath, key, String(index)],
          depth + 1,
          context,
          false,
        ));
      }

      const combinatorNode: SchemaTreeNode = {
        id: schemaNodeId([...jsonPath, key]),
        name: key,
        children: sortNodes(branchNodes),
        metadata: {
          jsonPath: [...jsonPath, key],
          kind,
        },
      };

      children = [...(children ?? []), combinatorNode];
      isLeaf = false;
    }
  }

  /* Enum values */
  const enumValues = getArray(schema.enum);

  if (enumValues?.length && !children?.length) {
    baseMetadata.kind = "enum";
    isLeaf = true;
  }

  if (ref) {
    context.refStack.delete(ref);
  }

  context.activeSchemas.delete(schema);
  return {
    id: schemaNodeId(jsonPath),
    name,
    order: Object.prototype.hasOwnProperty.call(FIELD_ORDER, name) ? FIELD_ORDER[name] : undefined,
    metadata: {
      ...baseMetadata,
      isLeaf,
    },
    children,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Builds a deeply expanded tree from a JSON Schema object.
 *
 * Each node carries a jsonPath for jumping to the corresponding line in a
 * schema editor. Handles nested objects, arrays (items), allOf/anyOf/oneOf,
 * $ref (with circular reference detection), and enums.
 */
export function buildSchemaTree(
  schema: Record<string, unknown> | null | undefined,
  options: SchemaTreeOptions = {},
): SchemaTreeBuildResult {
  const resolvedOptions: Required<SchemaTreeOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  resolvedOptions.maxDepth = Number.isFinite(resolvedOptions.maxDepth)
    ? Math.min(128, Math.max(0, Math.trunc(resolvedOptions.maxDepth))) : DEFAULT_OPTIONS.maxDepth;
  resolvedOptions.maxNodes = Number.isFinite(resolvedOptions.maxNodes)
    ? Math.min(100000, Math.max(1, Math.trunc(resolvedOptions.maxNodes))) : DEFAULT_OPTIONS.maxNodes;
  const warnings: string[] = [];
  const schemaRecord = asRecord(schema);

  if (!schemaRecord) {
    return {
      root: {
        id: "root",
        name: "Schema",
        metadata: { jsonPath: [], kind: "root", isLeaf: true },
      },
      warnings: ["Schema is null or not an object."],
    };
  }

  const context: BuildContext = {
    options: resolvedOptions,
    warnings,
    refStack: new Set<string>(),
    activeSchemas: new Set<JsonRecord>(),
    remaining: resolvedOptions.maxNodes,
  };

  const root = buildSchemaNode(
    "root",
    schemaRecord,
    [],
    0,
    context,
    true,
  );

  if (context.remaining <= 0) warnings.push(`Schema node limit (${resolvedOptions.maxNodes}) reached; remaining branches were omitted.`);
  return {
    root,
    warnings,
  };
}

/**
 * Finds the schema tree node at the given JSON path.
 * Returns undefined if not found.
 */
export function findSchemaNodeByPath(
  root: SchemaTreeNode,
  jsonPath: string[],
): SchemaTreeNode | undefined {
  if (jsonPath.length === 0) {
    return root;
  }

  const targetPath = JSON.stringify(jsonPath);

  /* BFS search matching by metadata.jsonPath. */
  const queue: SchemaTreeNode[] = [root];

  const seen = new Set<SchemaTreeNode>();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];

    if (!node || seen.has(node)) {
      continue;
    }

    seen.add(node);
    const nodePath = JSON.stringify(node.metadata?.jsonPath);

    if (nodePath === targetPath) {
      return node;
    }

    for (const child of node.children ?? []) {
      queue.push(child);
    }
  }

  return undefined;
}

/**
 * Formats a type label for display (e.g. "string", "object", "string | null").
 */
export function formatSchemaType(metadata: SchemaNodeMetadata): string {
  if (metadata.kind === "enum") {
    return "enum";
  }

  if (metadata.kind === "ref") {
    return "$ref";
  }

  if (metadata.format) {
    return `${formatTypeLabel(metadata.type)} (${metadata.format})`;
  }

  return formatTypeLabel(metadata.type);
}
