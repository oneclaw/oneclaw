/**
 * AppViewState represents the full view state of the OpenClaw app.
 *
 * This is a type-only module. The actual implementation lives in app.ts
 * (the OpenClawApp LitElement class). AppViewState is a structural
 * interface that captures all the reactive properties of the app so
 * render functions can accept it without importing the class directly.
 */

import type { OpenClawApp } from "./app.ts";

/**
 * AppViewState is structurally equivalent to the OpenClawApp instance.
 * Render functions use this type to avoid a circular dependency on the class.
 */
export type AppViewState = OpenClawApp;
