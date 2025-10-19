import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { ApiStack } from './api-stack';
import { RealtimeStack } from './realtime-stack';

export interface FrontendStackProps extends StackProps {
  environmentName: string;
  api: ApiStack;
  realtime: RealtimeStack;
  assetBucket: Bucket;
}

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { environmentName, api, realtime, assetBucket } = props;

    const apiParameter = new StringParameter(this, 'FrontendApiUrl', {
      parameterName: `/excalidraw/${environmentName}/frontend/api-url`,
      stringValue: api.httpApi.apiEndpoint,
    });

    const wsParameter = new StringParameter(this, 'FrontendWebsocketUrl', {
      parameterName: `/excalidraw/${environmentName}/frontend/ws-url`,
      stringValue: `wss://${realtime.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${realtime.webSocketStage.stageName}`,
    });

    const bucketParameter = new StringParameter(this, 'FrontendAssetBucket', {
      parameterName: `/excalidraw/${environmentName}/frontend/asset-bucket`,
      stringValue: assetBucket.bucketName,
    });

    if (environmentName !== 'prod') {
      [apiParameter, wsParameter, bucketParameter].forEach((parameter) => {
        parameter.applyRemovalPolicy(RemovalPolicy.DESTROY);
      });
    }

    new CfnOutput(this, 'ExcalidrawApiUrl', {
      exportName: `ExcalidrawApiUrl-${environmentName}`,
      value: api.httpApi.apiEndpoint,
    });

    new CfnOutput(this, 'ExcalidrawWebsocketUrl', {
      exportName: `ExcalidrawWebSocketUrl-${environmentName}`,
      value: `wss://${realtime.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${realtime.webSocketStage.stageName}`,
    });

    new CfnOutput(this, 'ExcalidrawAssetBucket', {
      exportName: `ExcalidrawAssetBucket-${environmentName}`,
      value: assetBucket.bucketName,
    });
  }
}
