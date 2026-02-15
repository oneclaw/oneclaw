/**
 * Config form barrel module.
 *
 * Re-exports from config-form.analyze.ts, config-form.render.ts,
 * and config-form.shared.ts so that other modules can import from
 * a single path.
 */

export { analyzeConfigSchema } from "./config-form.analyze.ts";
export type { ConfigSchemaAnalysis } from "./config-form.analyze.ts";

export { SECTION_META, renderConfigForm } from "./config-form.render.ts";
export type { ConfigFormProps } from "./config-form.render.ts";

export { schemaType, pathKey, hintForPath, humanize, defaultValue } from "./config-form.shared.ts";
export type { JsonSchema } from "./config-form.shared.ts";

export { renderNode } from "./config-form.node.ts";
