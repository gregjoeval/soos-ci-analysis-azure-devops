import * as Task from "azure-pipelines-task-lib/task";
import * as FileSystem from "fs";
import * as Path from "path";
import * as Glob from "glob";
import {
  createAnalysisScanStructure,
  getSupportedPackageManagersManifests,
  IGetSupportedPackageManagersManifestsReturn,
  startAnalysisScan,
  uploadManifest,
  waitForScanToFinish,
} from "./api";
import { isNil } from "./utilities";
import { Logger } from "./Logger";

const excludeDirectories = ["**/node_modules/**", "**/bin/**", "**/obj/**", "**/lib/**"];

function createAnalysisScanName(): string {
  return new Date().toISOString();
}

const getOperatingEnvironment = (): string => {
  switch (Task.getPlatform()) {
    case Task.Platform.Windows:
      return "Windows";
    case Task.Platform.MacOS:
      return "MacOS";
    case Task.Platform.Linux:
      return "Linux";
  }
};

interface ITaskParameters {
  baseUri: string;
  clientId: string;
  path: string;
  project: string;
  apiKey: string;
  commitHash: string | null;
  branch: string | null;
  buildVersion: string | null;
  buildUri: string | null;
  branchUri: string | null;
  integrationType: string;
  operatingEnvironment: string;
  integrationName: string;
  waitForScan: boolean;
  verbose: boolean;
}

function getTaskInput<T = ITaskParameters>(name: keyof T & string): string | undefined {
  return Task.getInput(name, false);
}

function getRequiredTaskInput<T = ITaskParameters>(name: keyof T & string): string {
  const input = Task.getInput(name, true);
  if (isNil(input)) {
    throw new Error(`Missing required parameter '${name}'.`);
  }

  return input;
}

const getTaskParameters = (): ITaskParameters => {
  const parameters: ITaskParameters = {
    clientId: getRequiredTaskInput("clientId"),
    apiKey: getRequiredTaskInput("apiKey"),
    project: getRequiredTaskInput("project"),
    baseUri: getTaskInput("baseUri") ?? "https://api.soos.io/api/",
    path: getTaskInput("path") ?? ".",
    // excludedDirectories: getTaskInput("excludedDirectories", "."), // TODO: add a way to exclude directories via params
    commitHash: getTaskInput("commitHash") ?? null,
    branch: getTaskInput("branch") ?? null,
    buildVersion: getTaskInput("buildVersion") ?? null,
    buildUri: getTaskInput("buildUri") ?? null,
    branchUri: getTaskInput("branchUri") ?? null,
    integrationName: getTaskInput("integrationName") ?? "Azure DevOps Pipeline",
    integrationType: getTaskInput("integrationType") ?? "CI",
    operatingEnvironment: getTaskInput("operatingEnvironment") ?? getOperatingEnvironment(),
    waitForScan: getTaskInput("waitForScan") === "true",
    verbose: getTaskInput("verbose") === "true",
  };

  return parameters;
};

interface ISearchForManifestFiles {
  path: string;
  excludedDirectories: Array<string>;
  supportedPackageManagersManifests: IGetSupportedPackageManagersManifestsReturn;
}

interface IManifestFile {
  name: string;
  path: string;
}

const searchForManifestFiles = ({
  path,
  excludedDirectories,
  supportedPackageManagersManifests,
}: ISearchForManifestFiles): Array<IManifestFile> => {
  logger.group("Manifest Search");

  const currentDirectory = process.cwd();

  logger.log(`Set directory to ${path}`);
  process.chdir(path);

  const matchingFiles = supportedPackageManagersManifests.reduce<Array<string>>(
    (accumulator, packageManagerManifests) => {
      const matches = packageManagerManifests.manifests.map((manifest) => {
        const manifestGlobPattern = !manifest.pattern.startsWith(".")
          ? manifest.pattern // wildcard match
          : `*${manifest.pattern}`; // ends with

        const pattern = Path.join("**", manifestGlobPattern);

        const files = Glob.sync(pattern, {
          ignore: excludedDirectories,
          nocase: true,
        });

        // This is needed to resolve the path as an absolute opposed to trying to open the file at current directory.
        const absolutePathFiles = files.map((x) => Path.resolve(x));

        logger.log(`Found ${absolutePathFiles.length} files matching ${pattern}`);
        return absolutePathFiles;
      });

      return accumulator.concat(...matches);
    },
    []
  );

  process.chdir(currentDirectory);
  logger.log(`Set directory back to ${currentDirectory}`);

  const files = matchingFiles.map((filePath): IManifestFile => {
    logger.log(`Found manifest: ${filePath}`);

    const filename = Path.basename(filePath);
    const fileContent = FileSystem.readFileSync(filePath, "utf8");

    logger.log(`Manifest ${filename} with length ${fileContent.length}.`);

    return {
      name: filename,
      path: filePath,
    };
  });

  logger.groupEnd();
  return files;
};

async function run() {
  try {
    const parameters = getTaskParameters();

    global.logger = new Logger(parameters.verbose);

    logger.logVerbose("--- TASK PARAMETERS -----------");
    logger.logVerbose(parameters);
    logger.logVerbose("--- TASK PARAMETERS -----------");

    const analysisScanName = createAnalysisScanName();

    const { projectId, analysisScanId, reportUrl, reportStatusUrl } =
      await createAnalysisScanStructure({
        name: analysisScanName,
        baseUri: parameters.baseUri,
        apiKey: parameters.apiKey,
        clientId: parameters.clientId,
        project: parameters.project,
        commitHash: parameters.commitHash,
        branch: parameters.branch,
        buildVersion: parameters.buildVersion,
        buildUri: parameters.buildUri,
        branchUri: parameters.branchUri,
        integrationType: parameters.integrationType,
        operatingEnvironment: parameters.operatingEnvironment,
        integrationName: parameters.integrationName,
      });

    logger.log(`Analysis Scan Name: ${analysisScanName}`);
    logger.logVerbose(`Project Id: ${projectId}`);

    const supportedPackageManagersManifests = await getSupportedPackageManagersManifests({
      baseUri: parameters.baseUri,
      apiKey: parameters.apiKey,
      clientId: parameters.clientId,
    });

    const manifestFiles = searchForManifestFiles({
      path: parameters.path,
      excludedDirectories: excludeDirectories,
      supportedPackageManagersManifests: supportedPackageManagersManifests,
    });

    if (manifestFiles.length === 0) {
      throw new Error("No matching manifest files found.");
    }

    const uploadManifestPromises = manifestFiles.map(
      async (file) =>
        await uploadManifest({
          baseUri: parameters.baseUri,
          apiKey: parameters.apiKey,
          clientId: parameters.clientId,
          projectId: projectId,
          analysisId: analysisScanId,
          fileName: file.name,
          filePath: file.path,
        })
    );

    await Promise.all(uploadManifestPromises);

    await startAnalysisScan({
      baseUri: parameters.baseUri,
      apiKey: parameters.apiKey,
      clientId: parameters.clientId,
      projectId: projectId,
      analysisId: analysisScanId,
    });

    logger.log(`View the Security Analysis Scan results at: ${reportUrl}`);

    if (parameters.waitForScan) {
      await waitForScanToFinish({
        apiKey: parameters.apiKey,
        reportStatusUrl: reportStatusUrl,
      });
    }
  } catch (e: any) {
    console.error(`Task Failed. ${e?.message ?? e}`); // logger may not be defined
    Task.setResult(Task.TaskResult.Failed, e?.message ?? `Error occurred ${e}`);
  }
}

run();
