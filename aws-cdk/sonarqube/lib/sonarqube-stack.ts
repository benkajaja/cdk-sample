import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as elbargets from "@aws-cdk/aws-elasticloadbalancingv2-targets";
import * as r53 from "@aws-cdk/aws-route53";
import * as fs from "fs";

export class SonarqubeStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const vpc = ec2.Vpc.fromLookup(this, "myVPC",
      {isDefault: true}
    );

    const mySecurityGroup = new ec2.SecurityGroup(this, "mySecurityGroup", {
      vpc,
      securityGroupName: this.node.tryGetContext("securityGroupName"),
      description: this.node.tryGetContext("securityGroupDescription"),
      allowAllOutbound: true,
    });

    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9000));
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.icmpPing());


    const rawData = fs.readFileSync("./start.sh", "utf8");
    const userData = ec2.UserData.custom(cdk.Fn.sub(rawData));

    const ec2Instance = new ec2.Instance(this, "myInstance", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.LARGE
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      securityGroup: mySecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      keyName: this.node.tryGetContext("keyName"),
      instanceName: this.node.tryGetContext("instanceName"),
      userData: userData,
    });
    
    
    const cert = elbv2.ListenerCertificate.fromArn(
      this.node.tryGetContext("certificateArn")
    );
    
    const nlb = new elbv2.NetworkLoadBalancer(this, "myNLB",{
      vpc,
      internetFacing: true,
    });

    const nlblistener = nlb.addListener("myHTTPSlistener", {
      certificates: [cert],
      port: 443,
    });

    const nlbtargetgroup = nlblistener.addTargets("myNLBtarget", {
      port: 9000,
      protocol: elbv2.Protocol.TCP,
      targets: [new elbargets.InstanceTarget(ec2Instance)],
    });

    const cname = new r53.CnameRecord(this, "myCNAME", {
      domainName: nlb.loadBalancerDnsName,
      recordName: this.node.tryGetContext("recordName"),
      zone: r53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
        hostedZoneId: this.node.tryGetContext("zoneId"),
        zoneName: this.node.tryGetContext("zoneName"),
      }),
    });

    new cdk.CfnOutput(this, "InstanceID",{
      value: ec2Instance.instanceId
    });

    new cdk.CfnOutput(this, "EC2PublicDns", {
      value: ec2Instance.instancePublicDnsName,
    });

    new cdk.CfnOutput(this, "EC2PublicIp", {
      value: ec2Instance.instancePublicIp,
    });

    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: nlb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, "sonarqubeDNS", { 
      value: `https://${cname.domainName}` 
    });
  }
}
