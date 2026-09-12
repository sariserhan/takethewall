/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminNotifications from "../adminNotifications.js";
import type * as analytics from "../analytics.js";
import type * as anchoring from "../anchoring.js";
import type * as auditTrail from "../auditTrail.js";
import type * as auth from "../auth.js";
import type * as claimAuth from "../claimAuth.js";
import type * as crons from "../crons.js";
import type * as deliveryAdmin from "../deliveryAdmin.js";
import type * as demoStats from "../demoStats.js";
import type * as demoValues from "../demoValues.js";
import type * as documents from "../documents.js";
import type * as emailDelivery from "../emailDelivery.js";
import type * as funnel from "../funnel.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as mail from "../mail.js";
import type * as milestoneAlerts from "../milestoneAlerts.js";
import type * as model from "../model.js";
import type * as numbering from "../numbering.js";
import type * as operations from "../operations.js";
import type * as ownerModel from "../ownerModel.js";
import type * as owners from "../owners.js";
import type * as paymentIssues from "../paymentIssues.js";
import type * as purchases from "../purchases.js";
import type * as recovery from "../recovery.js";
import type * as rehearsal from "../rehearsal.js";
import type * as rewardModel from "../rewardModel.js";
import type * as rewardSchema from "../rewardSchema.js";
import type * as rewards from "../rewards.js";
import type * as support from "../support.js";
import type * as uploads from "../uploads.js";
import type * as visitorping from "../visitorping.js";
import type * as wall from "../wall.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminNotifications: typeof adminNotifications;
  analytics: typeof analytics;
  anchoring: typeof anchoring;
  auditTrail: typeof auditTrail;
  auth: typeof auth;
  claimAuth: typeof claimAuth;
  crons: typeof crons;
  deliveryAdmin: typeof deliveryAdmin;
  demoStats: typeof demoStats;
  demoValues: typeof demoValues;
  documents: typeof documents;
  emailDelivery: typeof emailDelivery;
  funnel: typeof funnel;
  health: typeof health;
  http: typeof http;
  jobs: typeof jobs;
  mail: typeof mail;
  milestoneAlerts: typeof milestoneAlerts;
  model: typeof model;
  numbering: typeof numbering;
  operations: typeof operations;
  ownerModel: typeof ownerModel;
  owners: typeof owners;
  paymentIssues: typeof paymentIssues;
  purchases: typeof purchases;
  recovery: typeof recovery;
  rehearsal: typeof rehearsal;
  rewardModel: typeof rewardModel;
  rewardSchema: typeof rewardSchema;
  rewards: typeof rewards;
  support: typeof support;
  uploads: typeof uploads;
  visitorping: typeof visitorping;
  wall: typeof wall;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
