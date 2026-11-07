import { readFile, mkdir, writeFile } from "node:fs/promises";

const bootstrap = await readFile("deploy/aws/bootstrap.sh", "utf8");
const sub = (value: string) => ({ "Fn::Sub": value });
const ref = (value: string) => ({ Ref: value });
const get = (name: string, field: string) => ({ "Fn::GetAtt": [name, field] });
const template = {
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "AXIS Sydney API and worker: one small server, encrypted persistent EBS, HTTPS and SSM; no load balancer, NAT gateway or SQL database.",
  Parameters: {
    VpcId: { Type: "AWS::EC2::VPC::Id" },
    SubnetId: { Type: "AWS::EC2::Subnet::Id" },
    ImageId: { Type: "AWS::EC2::Image::Id" },
  },
  Resources: {
    Artifacts: {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
        OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
        LifecycleConfiguration: { Rules: [{ Id: "ExpireDeploymentArtifacts", Status: "Enabled", ExpirationInDays: 7, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] },
        Tags: [{ Key: "Application", Value: "AXIS" }],
      },
    },
    ServerRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }] },
        ManagedPolicyArns: ["arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"],
        Policies: [{ PolicyName: "AxisDeploymentRead", PolicyDocument: { Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: "s3:GetObject", Resource: sub("${Artifacts.Arn}/*") },
          { Effect: "Allow", Action: "ssm:GetParameter", Resource: sub("arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/axis/production/*") },
        ] } }],
      },
    },
    ServerProfile: { Type: "AWS::IAM::InstanceProfile", Properties: { Roles: [ref("ServerRole")] } },
    SecurityGroup: {
      Type: "AWS::EC2::SecurityGroup",
      Properties: {
        GroupDescription: "AXIS public HTTPS and certificate challenges; administration through SSM only",
        VpcId: ref("VpcId"),
        SecurityGroupIngress: [
          { IpProtocol: "tcp", FromPort: 80, ToPort: 80, CidrIp: "0.0.0.0/0" },
          { IpProtocol: "tcp", FromPort: 443, ToPort: 443, CidrIp: "0.0.0.0/0" },
        ],
        Tags: [{ Key: "Name", Value: "axis-production-https" }],
      },
    },
    Server: {
      Type: "AWS::EC2::Instance",
      Properties: {
        ImageId: ref("ImageId"), InstanceType: "t3.small", IamInstanceProfile: ref("ServerProfile"),
        CreditSpecification: { CPUCredits: "standard" },
        MetadataOptions: { HttpTokens: "required", HttpEndpoint: "enabled", HttpPutResponseHopLimit: 1 },
        NetworkInterfaces: [{ DeviceIndex: "0", AssociatePublicIpAddress: false, SubnetId: ref("SubnetId"), GroupSet: [ref("SecurityGroup")] }],
        BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeType: "gp3", VolumeSize: 20, Encrypted: true, DeleteOnTermination: false } }],
        UserData: { "Fn::Base64": { "Fn::Join": ["", ["#!/bin/bash\nexport AWS_DEFAULT_REGION=", ref("AWS::Region"), "\n", bootstrap]] } },
        Tags: [{ Key: "Name", Value: "axis-production-api-worker" }, { Key: "Application", Value: "AXIS" }],
      },
    },
    Address: { Type: "AWS::EC2::EIP", Properties: { Domain: "vpc", Tags: [{ Key: "Name", Value: "axis-production-api" }] } },
    AddressAssociation: { Type: "AWS::EC2::EIPAssociation", Properties: { AllocationId: get("Address", "AllocationId"), InstanceId: ref("Server") } },
  },
  Outputs: { InstanceId: { Value: ref("Server") }, PublicIp: { Value: ref("Address") }, ArtifactBucket: { Value: ref("Artifacts") } },
};
await mkdir(".axis/deployment", { recursive: true });
await writeFile(".axis/deployment/aws-template.json", JSON.stringify(template, null, 2) + "\n");
console.log("Prepared .axis/deployment/aws-template.json (deploy only in ap-southeast-2).");
