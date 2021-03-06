'use strict';
const util = require('util');
const generator = require('yeoman-generator');
const chalk = require('chalk');
const scriptBase = require('../generator-base');
const prompts = require('./prompts');
const AwsFactory = require('./lib/aws.js');

const AwsGenerator = generator.extend({});

util.inherits(AwsGenerator, scriptBase);

module.exports = AwsGenerator.extend({
    initializing: {
        initAws: function () {
            const done = this.async();
            this.awsFactory = new AwsFactory(this, done);
        },
        getGlobalConfig: function () {
            this.existingProject = false;
            this.baseName = this.config.get('baseName');
            this.buildTool = this.config.get('buildTool');
        },
        getAwsConfig: function () {
            const awsConfig = this.config.get('aws');

            if (awsConfig) {
                this.existingProject = true;
                this.applicationName = awsConfig.applicationName;
                this.environmentName = awsConfig.environmentName;
                this.bucketName = awsConfig.bucketName;
                this.instanceType = awsConfig.instanceType;
                this.awsRegion = awsConfig.awsRegion;
                this.dbName = awsConfig.dbName;
                this.dbInstanceClass = awsConfig.dbInstanceClass;

                this.log(chalk.green('This is an existing deployment, using the configuration from your .yo-rc.json file \n' +
                    'to deploy your application...\n'));
            }
        },
        checkDatabase: function () {
            const prodDatabaseType = this.config.get('prodDatabaseType');

            switch (prodDatabaseType.toLowerCase()) {
            case 'mysql':
                this.dbEngine = 'mysql';
                break;
            case 'postgresql':
                this.dbEngine = 'postgres';
                break;
            default:
                this.error(chalk.red('Sorry deployment for this database is not possible'));
            }
        }
    },

    prompting: prompts.prompting,

    configuring: {
        insight: function () {
            const insight = this.insight();
            insight.trackWithEvent('generator', 'aws');
        },
        createAwsFactory: function () {
            const cb = this.async();
            this.awsFactory.init({region: this.awsRegion});
            cb();
        },
        saveConfig: function () {
            this.config.set('aws', {
                applicationName: this.applicationName,
                environmentName: this.environmentName,
                bucketName: this.bucketName,
                instanceType: this.instanceType,
                awsRegion: this.awsRegion,
                dbName: this.dbName,
                dbInstanceClass: this.dbInstanceClass
            });
        }
    },

    default: {
        productionBuild: function () {
            const cb = this.async();
            this.log(chalk.bold('Building application'));

            const child = this.buildApplication(this.buildTool, 'prod', (err) => {
                if (err) {
                    this.error(chalk.red(err));
                } else {
                    cb();
                }
            });

            child.stdout.on('data', (data) => {
                this.log(data.toString());
            });
        },
        createBucket: function () {
            const cb = this.async();
            this.log();
            this.log(chalk.bold('Create S3 bucket'));

            const s3 = this.awsFactory.getS3();

            s3.createBucket({bucket: this.bucketName}, (err, data) => {
                if (err) {
                    this.error(chalk.red(err.message));
                } else {
                    this.log(data.message);
                    cb();
                }
            });
        },
        uploadWar: function () {
            const cb = this.async();
            this.log();
            this.log(chalk.bold('Upload WAR to S3'));

            const s3 = this.awsFactory.getS3();

            const params = {
                bucket: this.bucketName,
                buildTool: this.buildTool
            };

            s3.uploadWar(params, (err, data) => {
                if (err) {
                    this.error(chalk.red(err.message));
                } else {
                    this.warKey = data.warKey;
                    this.log(data.message);
                    cb();
                }
            });
        },
        createDatabase: function () {
            const cb = this.async();
            this.log();
            this.log(chalk.bold('Create database'));

            const rds = this.awsFactory.getRds();

            const params = {
                dbInstanceClass: this.dbInstanceClass,
                dbName: this.dbName,
                dbEngine: this.dbEngine,
                dbPassword: this.dbPassword,
                dbUsername: this.dbUsername
            };

            rds.createDatabase(params, (err, data) => {
                if (err) {
                    this.error(chalk.red(err.message));
                } else {
                    this.log(data.message);
                    cb();
                }
            });
        },
        createDatabaseUrl: function () {
            const cb = this.async();
            this.log();
            this.log(chalk.bold('Waiting for database (This may take several minutes)'));

            if (this.dbEngine === 'postgres') {
                this.dbEngine = 'postgresql';
            }

            const rds = this.awsFactory.getRds();

            const params = {
                dbName: this.dbName,
                dbEngine: this.dbEngine
            };

            rds.createDatabaseUrl(params, (err, data) => {
                if (err) {
                    this.error(chalk.red(err.message));
                } else {
                    this.dbUrl = data.dbUrl;
                    this.log(data.message);
                    cb();
                }
            });
        },
        createApplication: function () {
            const cb = this.async();
            this.log();
            this.log(chalk.bold('Create/Update application'));

            const eb = this.awsFactory.getEb();

            const params = {
                applicationName: this.applicationName,
                bucketName: this.bucketName,
                warKey: this.warKey,
                environmentName: this.environmentName,
                dbUrl: this.dbUrl,
                dbUsername: this.dbUsername,
                dbPassword: this.dbPassword,
                instanceType: this.instanceType
            };

            eb.createApplication(params, (err, data) => {
                if (err) {
                    this.error(chalk.red(err.message));
                } else {
                    this.log(data.message);
                    cb();
                }
            });
        }
    }
});
