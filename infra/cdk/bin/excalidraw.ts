#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { PersistenceStack } from "../lib/persistence-stack";
import { ApiStack } from "../lib/api-stack";
import { RealtimeStack } from "../lib/realtime-stack";
import { ObservabilityStack } from "../lib/observability-stack";
import { FrontendStack } from "../lib/frontend-stack";

interface EnvironmentConfig {
  account: string;
  region: string;
}

interface StackContext {
  name: string;
  config: EnvironmentConfig;
}

const app = new cdk.App();

const contextEnvironments = app.node.tryGetContext("environments") as
  | Record<string, EnvironmentConfig>
  | undefined;
const cliEnvName =
  (app.node.tryGetContext("environment") as string | undefined) ??
  process.env.CDK_ENVIRONMENT ??
  "dev";

let resolvedEnv: StackContext;
if (contextEnvironments && cliEnvName in contextEnvironments) {
  resolvedEnv = {
    name: cliEnvName,
    config: contextEnvironments[cliEnvName],
  };
} else {
  const account = process.env.CDK_DEFAULT_ACCOUNT;
  const region = process.env.CDK_DEFAULT_REGION;

  if (!account || !region) {
    throw new Error(
      `Unable to resolve environment configuration. Provide a context value for "environment=${cliEnvName}" or ensure CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION are set.`
    );
  }

  resolvedEnv = {
    name: cliEnvName,
    config: {
      account,
      region,
    },
  };
}

const sharedProps = {
  env: resolvedEnv.config,
  tags: {
    Project: "excalidraw",
    Environment: resolvedEnv.name,
  },
};

const persistence = new PersistenceStack(
  app,
  `ExcalidrawPersistence-${resolvedEnv.name}`,
  {
    ...sharedProps,
    environmentName: resolvedEnv.name,
  }
);

const api = new ApiStack(app, `ExcalidrawApi-${resolvedEnv.name}`, {
  ...sharedProps,
  environmentName: resolvedEnv.name,
  table: persistence.table,
  assetBucket: persistence.assetBucket,
});
api.addDependency(persistence);

const realtime = new RealtimeStack(
  app,
  `ExcalidrawRealtime-${resolvedEnv.name}`,
  {
    ...sharedProps,
    environmentName: resolvedEnv.name,
    table: persistence.table,
    streamSource: persistence.streamSource,
  }
);
realtime.addDependency(persistence);

const observability = new ObservabilityStack(
  app,
  `ExcalidrawObservability-${resolvedEnv.name}`,
  {
    ...sharedProps,
    environmentName: resolvedEnv.name,
    api,
    realtime,
    persistence,
  }
);
observability.addDependency(api);
observability.addDependency(realtime);

const frontend = new FrontendStack(
  app,
  `ExcalidrawFrontend-${resolvedEnv.name}`,
  {
    ...sharedProps,
    environmentName: resolvedEnv.name,
    api,
    realtime,
    assetBucket: persistence.assetBucket,
  }
);
frontend.addDependency(api);
frontend.addDependency(realtime);
