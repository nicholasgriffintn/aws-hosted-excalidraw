import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { WebSocketApi, WebSocketStage, CfnRoute as WebSocketCfnRoute } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction, NodejsFunctionProps, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Tracing, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Schedule, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as path from 'node:path';

export interface RealtimeStackProps extends StackProps {
  environmentName: string;
  table: Table;
  streamSource: Table;
}

export class RealtimeStack extends Stack {
  readonly webSocketApi: WebSocketApi;
  readonly webSocketStage: WebSocketStage;
  readonly connectLambda: NodejsFunction;
  readonly disconnectLambda: NodejsFunction;
  readonly defaultLambda: NodejsFunction;
  readonly streamDispatchLambda: NodejsFunction;
  readonly cleanupLambda: NodejsFunction;

  constructor(scope: Construct, id: string, props: RealtimeStackProps) {
    super(scope, id, props);

    const { environmentName, table, streamSource } = props;

    const lambdaDefaults: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(10),
      bundling: {
        minify: true,
        format: OutputFormat.ESM,
        target: 'node22',
        banner: 'import { createRequire as topLevelCreateRequire } from "module";const require = topLevelCreateRequire(import.meta.url);',
        externalModules: ['aws-sdk'],
      },
      logRetention: RetentionDays.ONE_MONTH,
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        ENVIRONMENT: environmentName,
      },
    };

    this.connectLambda = new NodejsFunction(this, 'ConnectHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../../apps/websocket-connect/src/handler.ts'),
    });
    this.disconnectLambda = new NodejsFunction(this, 'DisconnectHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../../apps/websocket-disconnect/src/handler.ts'),
    });
    this.defaultLambda = new NodejsFunction(this, 'DefaultHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../../apps/websocket-default/src/handler.ts'),
      environment: {
        ...lambdaDefaults.environment,
        CONNECTION_TABLE_NAME: table.tableName,
      },
    });

    table.grantReadWriteData(this.connectLambda);
    table.grantReadWriteData(this.disconnectLambda);
    table.grantReadWriteData(this.defaultLambda);

    this.webSocketApi = new WebSocketApi(this, 'WebSocketApi', {
      apiName: `ExcalidrawRealtime-${environmentName}`,
      routeSelectionExpression: '$request.body.action',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', this.connectLambda),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', this.disconnectLambda),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('DefaultIntegration', this.defaultLambda),
      },
    });

    this.webSocketStage = new WebSocketStage(this, 'WebSocketStage', {
      stageName: environmentName,
      autoDeploy: true,
      webSocketApi: this.webSocketApi,
    });

    // Enforce IAM auth on connect route only (AWS WebSocket API limitation).
    const cfnRoutes = this.webSocketApi.node.findAll().filter((c) => c instanceof WebSocketCfnRoute) as WebSocketCfnRoute[];
    cfnRoutes.forEach((cfnRoute) => {
      if (cfnRoute.routeKey === "$connect") {
        cfnRoute.authorizationType = "AWS_IAM";
      }
    });

    const webSocketEndpoint = `https://${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${this.webSocketStage.stageName}`;
    this.webSocketApi.grantManageConnections(this.defaultLambda);

    this.streamDispatchLambda = new NodejsFunction(this, 'StreamDispatchHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../../apps/stream-dispatch/src/handler.ts'),
    });
    this.streamDispatchLambda.addEnvironment('WEBSOCKET_API_ENDPOINT', webSocketEndpoint);
    table.grantReadWriteData(this.streamDispatchLambda);
    streamSource.grantStreamRead(this.streamDispatchLambda);
    this.webSocketApi.grantManageConnections(this.streamDispatchLambda);
    this.streamDispatchLambda.addEventSource(
      new DynamoEventSource(streamSource, {
        startingPosition: StartingPosition.LATEST,
        bisectBatchOnError: true,
        retryAttempts: 2,
      }),
    );

    this.cleanupLambda = new NodejsFunction(this, 'CronCleanupHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../../apps/cron-cleanup/src/handler.ts'),
      timeout: Duration.seconds(30),
    });
    table.grantReadWriteData(this.cleanupLambda);

    new Rule(this, 'CleanupSchedule', {
      schedule: Schedule.rate(Duration.hours(6)),
      targets: [new LambdaFunction(this.cleanupLambda)],
    });

    new StringParameter(this, 'WebSocketEndpointParameter', {
      parameterName: `/excalidraw/${environmentName}/realtime/url`,
      stringValue: `wss://${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${this.webSocketStage.stageName}`,
    }).applyRemovalPolicy(environmentName === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY);
  }
}
