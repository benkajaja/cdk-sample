import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as targets from "@aws-cdk/aws-elasticloadbalancingv2-targets";
import * as r53 from "@aws-cdk/aws-route53";
import * as r53tg from "@aws-cdk/aws-route53-targets";
import * as certmgr from "@aws-cdk/aws-certificatemanager";

export class JenkinsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const vpc = new ec2.Vpc(this, "myVPC", {
      natGateways: 1,
    });
    
    const mySecurityGroup = new ec2.SecurityGroup(this, "mySecurityGroup", {
      vpc,
      securityGroupName: this.node.tryGetContext("securityGroupName"),
      description: this.node.tryGetContext("securityGroupDescription"),
      allowAllOutbound: true,
    });
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8080));
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.icmpPing());
    
    var shellcommand = ec2.UserData.forLinux();
    shellcommand.addCommands(
      "yum install docker -y",
      "systemctl start docker",
      "usermod -aG docker ec2-user",
      "usermod -aG docker ssm-user",
      "chmod +x /var/run/docker.sock",
      "systemctl restart docker && systemctl enable docker",
      "mkdir /home/ec2-user/jenkins-data",
      "docker run --name jks --rm -d -u root -p 8080:8080 -p 50000:50000 -v /home/ec2-user/jenkins-data:/var/jenkins_home -v /var/run/docker.sock:/var/run/docker.sock -v /home/ec2-user:/home jenkinsci/blueocean",
    );
    
    const ec2Instance = new ec2.Instance(this, "myInstance", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.SMALL
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
      userData: shellcommand,
    });

    const acm = certmgr.Certificate.fromCertificateArn(this, 
      "myCert",
      this.node.tryGetContext("certificateArn")
    );
    const alb = new elbv2.ApplicationLoadBalancer(this, "myALB", {
      vpc,
      internetFacing: true,
    });
    alb.addListener("myWebhttp", {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.redirect( {
        protocol: "HTTPS",
        host: "#{host}",
        path: "/#{path}",
        query: "/#{query}",
        port: "443",
      }),
    });

    const listener = alb.addListener("myALBListener", {
      certificates: [acm],
      port: 443,
      open: true,
    });

    listener.connections.allowTo(ec2Instance, ec2.Port.tcp(8080));

    listener.addTargets("myTargets", {
      port: 8080,
      targets: [new targets.InstanceTarget(ec2Instance)],
    });

    const zone = r53.HostedZone.fromHostedZoneAttributes(this, "myZone", {
      hostedZoneId: this.node.tryGetContext("zoneId"),
      zoneName: this.node.tryGetContext("zoneName"),
    });

    const r53alias = new r53.ARecord(this, "myARecord", {
      zone,
      target: r53.RecordTarget.fromAlias(new r53tg.LoadBalancerTarget(alb)),
      recordName: this.node.tryGetContext("recordName"),
      ttl: cdk.Duration.minutes(5),
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
      value: alb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, "aliasalbOutput", {
      value: r53alias.domainName,
    });
  }
}
