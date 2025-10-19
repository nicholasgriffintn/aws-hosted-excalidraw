import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { HttpApi, HttpMethod, CorsHttpMethod, CfnRoute, HttpRoute } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction, NodejsFunctionProps, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as path from 'node:path';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface ApiStackProps extends StackProps {
  environmentName: string;
  table: Table;
  assetBucket: Bucket;
}

export class ApiStack extends Stack {
  readonly httpApi: HttpApi;
  readonly boardsLambda: NodejsFunction;
  readonly elementsLambda: NodejsFunction;
  readonly teamsLambda: NodejsFunction;
  readonly assetsLambda: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { environmentName, table, assetBucket } = props;

    const baseLambdaProps: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_22_X,
      bundling: {
        minify: true,
        format: OutputFormat.ESM,
        target: 'node22',
        banner: 'import { createRequire as topLevelCreateRequire } from "module";const require = topLevelCreateRequire(import.meta.url);',
        externalModules: ['aws-sdk'],
      },
      timeout: Duration.seconds(10),
      logRetention: RetentionDays.ONE_MONTH,
      tracing: Tracing.ACTIVE,
      environment: {
        TABLE_NAME: table.tableName,
        ASSET_BUCKET_NAME: assetBucket.bucketName,
        ENVIRONMENT: environmentName,
      },
    };

    // Boards Lambda handles board CRUD and trash operations.
    this.boardsLambda = new NodejsFunction(this, 'BoardsHandler', {
      ...baseLambdaProps,
      entry: path.join(__dirname, '../../../apps/api-boards/src/handler.ts'),
    });
    table.grantReadWriteData(this.boardsLambda);
    assetBucket.grantReadWrite(this.boardsLambda);

    // Elements Lambda handles element upserts and fetches.
    this.elementsLambda = new NodejsFunction(this, 'ElementsHandler', {
      ...baseLambdaProps,
      entry: path.join(__dirname, '../../../apps/api-elements/src/handler.ts'),
    });
    table.grantReadWriteData(this.elementsLambda);

    // Teams Lambda handles team membership and metadata.
    this.teamsLambda = new NodejsFunction(this, 'TeamsHandler', {
      ...baseLambdaProps,
      entry: path.join(__dirname, '../../../apps/api-teams/src/handler.ts'),
    });
    table.grantReadWriteData(this.teamsLambda);

    this.assetsLambda = new NodejsFunction(this, 'AssetsHandler', {
      ...baseLambdaProps,
      entry: path.join(__dirname, '../../../apps/api-assets/src/handler.ts'),
    });
    assetBucket.grantReadWrite(this.assetsLambda);

    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiName: `ExcalidrawHttpApi-${environmentName}`,
      corsPreflight: {
        allowHeaders: [
          'content-type',
          'authorization',
          'x-amz-security-token',
          'x-excalidraw-team-id',
          'x-excalidraw-user-id'
        ],
        allowMethods: [CorsHttpMethod.ANY],
        allowOrigins: ['*'],
        maxAge: Duration.hours(1),
      },
    });

    const boardsIntegration = new HttpLambdaIntegration('BoardsIntegration', this.boardsLambda);
    this.requireIamAuth(
      this.httpApi.addRoutes({
      path: '/boards',
      methods: [HttpMethod.ANY],
      integration: boardsIntegration,
    }));
    this.requireIamAuth(
      this.httpApi.addRoutes({
      path: '/boards/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: boardsIntegration,
    }));

    const elementsIntegration = new HttpLambdaIntegration('ElementsIntegration', this.elementsLambda);
    this.requireIamAuth(
      this.httpApi.addRoutes({
      path: '/boards/{boardId}/elements',
      methods: [HttpMethod.ANY],
      integration: elementsIntegration,
    }));

    const teamsIntegration = new HttpLambdaIntegration('TeamsIntegration', this.teamsLambda);
    this.requireIamAuth(
      this.httpApi.addRoutes({
      path: '/teams',
      methods: [HttpMethod.ANY],
      integration: teamsIntegration,
    }));
    this.requireIamAuth(
      this.httpApi.addRoutes({
      path: '/teams/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: teamsIntegration,
    }));

    const assetsIntegration = new HttpLambdaIntegration('AssetsIntegration', this.assetsLambda);
    this.requireIamAuth(
      this.httpApi.addRoutes({
      path: '/assets',
      methods: [HttpMethod.ANY],
      integration: assetsIntegration,
    }));
    this.requireIamAuth(
      this.httpApi.addRoutes({
      path: '/assets/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: assetsIntegration,
    }));

    new StringParameter(this, 'ApiUrlParameter', {
      parameterName: `/excalidraw/${environmentName}/api/url`,
      stringValue: this.httpApi.apiEndpoint,
    }).applyRemovalPolicy(environmentName === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY);
  }

  private requireIamAuth(routes: HttpRoute[]): void {
    routes.forEach((route) => {
      const cfnRoute = route.node.defaultChild as CfnRoute;
      cfnRoute.authorizationType = 'NONE';
    });
  }
}
