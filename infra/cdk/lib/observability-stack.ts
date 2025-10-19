import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Dashboard,
  GraphWidget,
  LegendPosition,
  Metric,
  Alarm,
  AlarmWidget,
  TextWidget,
} from 'aws-cdk-lib/aws-cloudwatch';
import { ApiStack } from './api-stack';
import { RealtimeStack } from './realtime-stack';
import { PersistenceStack } from './persistence-stack';

export interface ObservabilityStackProps extends StackProps {
  environmentName: string;
  api: ApiStack;
  realtime: RealtimeStack;
  persistence: PersistenceStack;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { environmentName, api, realtime, persistence } = props;

    const apiLatency = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensionsMap: {
        ApiId: api.httpApi.apiId,
        Stage: '$default',
      },
      statistic: 'p99',
      period: Duration.minutes(1),
    });

    const api5xx = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5xx',
      dimensionsMap: {
        ApiId: api.httpApi.apiId,
        Stage: '$default',
      },
      statistic: 'sum',
      period: Duration.minutes(5),
    });

    const webSocket4xx = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '4xx',
      dimensionsMap: {
        ApiId: realtime.webSocketApi.apiId,
        Stage: realtime.webSocketStage.stageName,
      },
      statistic: 'sum',
      period: Duration.minutes(5),
    });

    const tableThrottles = persistence.table.metric('ThrottledRequests', {
      statistic: 'sum',
      period: Duration.minutes(5),
    });

    const apiLatencyAlarm = new Alarm(this, 'ApiLatencyAlarm', {
      metric: apiLatency,
      threshold: 2000,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
    });

    const api5xxAlarm = new Alarm(this, 'Api5xxAlarm', {
      metric: api5xx,
      threshold: 5,
      evaluationPeriods: 1,
    });

    const webSocketAlarm = new Alarm(this, 'WebSocket4xxAlarm', {
      metric: webSocket4xx,
      threshold: 10,
      evaluationPeriods: 1,
    });

    const dynamoThrottleAlarm = new Alarm(this, 'DynamoThrottleAlarm', {
      metric: tableThrottles,
      threshold: 10,
      evaluationPeriods: 1,
    });

    const dashboard = new Dashboard(this, 'OperationsDashboard', {
      dashboardName: `Excalidraw-${environmentName}`,
    });

    dashboard.addWidgets(
      new TextWidget({
        markdown: `# Excalidraw ${environmentName} Overview`,
        height: 1,
        width: 24,
      }),
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'API Latency (p99)',
        left: [apiLatency],
        width: 12,
        legendPosition: LegendPosition.RIGHT,
      }),
      new GraphWidget({
        title: 'API 5xx Errors',
        left: [api5xx],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'WebSocket 4xx Errors',
        left: [webSocket4xx],
        width: 12,
      }),
      new GraphWidget({
        title: 'DynamoDB Throttled Requests',
        left: [tableThrottles],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new AlarmWidget({
        title: "API Latency Alarm",
        alarm: apiLatencyAlarm,
        width: 24,
      })
    );

    dashboard.addWidgets(
      new AlarmWidget({
        title: "API 5xx Alarm",
        alarm: api5xxAlarm,
        width: 24,
      })
    );

    dashboard.addWidgets(
      new AlarmWidget({
        title: "WebSocket 4xx Alarm",
        alarm: webSocketAlarm,
        width: 24,
      })
    );

    dashboard.addWidgets(
      new AlarmWidget({
        title: "DynamoDB Throttle Alarm",
        alarm: dynamoThrottleAlarm,
        width: 24,
      })
    );
  }
}
