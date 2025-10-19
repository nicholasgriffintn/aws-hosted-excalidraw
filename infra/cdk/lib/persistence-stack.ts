import { RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';

export interface PersistenceStackProps extends StackProps {
  environmentName: string;
}

export class PersistenceStack extends Stack {
  readonly table: Table;
  readonly assetBucket: Bucket;
  readonly streamSource: Table;

  constructor(scope: Construct, id: string, props: PersistenceStackProps) {
    super(scope, id, props);

    const { environmentName } = props;

    this.table = new Table(this, "ExcalidrawTable", {
      tableName: `Excalidraw-${environmentName}`,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: AttributeType.STRING,
      },
      timeToLiveAttribute: "ttl",
      pointInTimeRecovery: true,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy:
        environmentName === "prod"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'gsi1pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'gsi2pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: { name: 'gsi3pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi3sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    const bucketName =
      props.env?.account != null
        ? `excalidraw-assets-${environmentName}-${props.env.account}`
        : undefined;

    this.assetBucket = new Bucket(this, 'AssetBucket', {
      bucketName,
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
      autoDeleteObjects: environmentName === 'prod' ? undefined : true,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: environmentName === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    Tags.of(this.assetBucket).add('DataClassification', 'internal');

    this.streamSource = this.table;
  }
}
