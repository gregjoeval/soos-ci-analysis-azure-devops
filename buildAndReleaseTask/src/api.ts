import axios, { AxiosError } from "axios";
import FormData from "form-data";
import fs from "fs";
import { delay } from "./utilities";

function isAxiosError(e: unknown): e is AxiosError {
  return (e as unknown as AxiosError)?.isAxiosError === true;
}

function logApiError(error: unknown) {
  if (isAxiosError(error)) {
    if (error.request) {
      logger.logVerbose(`Error Request:`);
      logger.logVerbose(error.request);
    }

    if (error.response) {
      logger.error(
        `Error Response Status: ${error.response.status} (${error.response.statusText})`
      );

      if (error.response.data) {
        logger.logVerbose(`Error Response Body:`);
        logger.logVerbose(error.response.data);
      }
    }

    logger.error(`Error Message: ${error.message}`);
  } else if (error instanceof Error) {
    logger.error(`Error Message: ${error.message}`);
  }
}
interface ICreateClientArguments {
  baseUri?: string;
  apiKey: string;
}

function createClient({ baseUri, apiKey }: ICreateClientArguments) {
  return axios.create({
    baseURL: baseUri,
    headers: {
      "x-soos-apikey": apiKey,
      "Content-Type": "application/json",
    },
  });
}

interface ICreateAnalysisScanStructureArguments extends ICreateClientArguments {
  clientId: string;
  project: string;
  name: string;
  commitHash: string | null;
  branch: string | null;
  buildVersion: string | null;
  buildUri: string | null;
  branchUri: string | null;
  integrationType: string;
  operatingEnvironment: string;
  integrationName: string;
}

interface ICreateAnalysisScanStructureReturn {
  projectId: string;
  analysisScanId: string;
  reportUrl: string;
  reportStatusUrl: string;
}

/**
 * @throws Error
 */
export async function createAnalysisScanStructure({
  baseUri,
  apiKey,
  clientId,
  project,
  name,
  commitHash,
  branch,
  buildVersion,
  buildUri,
  branchUri,
  integrationType,
  operatingEnvironment,
  integrationName,
}: ICreateAnalysisScanStructureArguments): Promise<ICreateAnalysisScanStructureReturn> {
  interface ApiAnalysisStructureRequestBody {
    name: string;
    project: string;
    commitHash: string | null;
    branch: string | null;
    buildVersion: string | null;
    buildUri: string | null;
    branchUri: string | null;
    integrationType: string;
    operatingEnvironment: string;
    integrationName: string | null;
  }

  interface ApiAnalysisStructureResponseBody {
    projectId: string;
    Id: string;
    reportUrl: string;
    reportStatusUrl: string;
  }

  const client = createClient({ baseUri, apiKey });

  const apiStructureUrl = `clients/${clientId}/analysis/structure`;

  const body: ApiAnalysisStructureRequestBody = {
    name: name,
    project: project,
    commitHash: commitHash,
    branch: branch,
    buildVersion: buildVersion,
    buildUri: buildUri,
    branchUri: branchUri,
    integrationType: integrationType,
    operatingEnvironment: operatingEnvironment,
    integrationName: integrationName,
  };

  logger.log(`Create Analysis Scan Structure - Request Url (POST): ${apiStructureUrl}`);
  try {
    const response = await client.post<ApiAnalysisStructureResponseBody>(apiStructureUrl, body);

    logger.log(
      `Create Analysis Scan Structure - Response: ${response.status} (${response.statusText})`
    );
    logger.logVerbose(
      `Create Analysis Scan Structure - Response Body: ${JSON.stringify(response.data)}`
    );

    return {
      projectId: response.data.projectId,
      analysisScanId: response.data.Id,
      reportUrl: response.data.reportUrl,
      reportStatusUrl: response.data.reportStatusUrl,
    };
  } catch (error: unknown) {
    logApiError(error);
    throw error;
  }
}

interface IGetSupportedPackageManagersManifestsArguments extends ICreateClientArguments {
  clientId: string;
}

export type IGetSupportedPackageManagersManifestsReturn = Array<{
  packageManager: string;
  manifests: Array<{
    pattern: string;
    isLockFile: boolean;
  }>;
}>;

/**
 * @throws Error
 */
export async function getSupportedPackageManagersManifests({
  baseUri,
  apiKey,
  clientId,
}: IGetSupportedPackageManagersManifestsArguments): Promise<IGetSupportedPackageManagersManifestsReturn> {
  const client = createClient({ baseUri, apiKey });

  const manifestApiUrl = `clients/${clientId}/manifests`;

  logger.log(`Get Manifests - Request Url (GET): ${manifestApiUrl}`);

  try {
    const response = await client.get<IGetSupportedPackageManagersManifestsReturn>(manifestApiUrl);

    logger.log(`Get Manifests - Response Status: ${response.status} (${response.statusText})`);
    logger.logVerbose(`Get Manifests - Response Body: ${JSON.stringify(response.data)}`);

    return response.data;
  } catch (error: unknown) {
    logApiError(error);
    throw error;
  }
}

interface IStartAnalysisArguments extends ICreateClientArguments {
  clientId: string;
  projectId: string;
  analysisId: string;
}

interface IPutManifestArguments extends ICreateClientArguments {
  clientId: string;
  projectId: string;
  analysisId: string;
  fileName: string;
  filePath: string;
}

/**
 * @throws Error
 */
export async function uploadManifest({
  baseUri,
  apiKey,
  clientId,
  projectId,
  analysisId,
  fileName,
  filePath,
}: IPutManifestArguments): Promise<void> {
  const client = createClient({ baseUri, apiKey });

  // NOTE: we replace . with * to avoid web server file extension issues; the reverse is done server side
  const encodedFileName = fileName.replace(/\./g, "*");
  const manifestApiUrl = `clients/${clientId}/projects/${projectId}/analysis/${analysisId}/manifests/${encodedFileName}`;
  logger.log(`Upload Manifest - Request Url (PUT): ${manifestApiUrl}`);

  const formData = new FormData();
  let fileReadStream;

  fileReadStream = fs.createReadStream(filePath, { encoding: "utf8" });

  try {
    formData.append("manifest", fileReadStream);

    const response = await client.put(manifestApiUrl, formData, {
      headers: formData.getHeaders(),
    });

    logger.log(`Response Status: ${response.status} (${response.statusText})\n`);
    logger.logVerbose(`Response Body: ${JSON.stringify(response.data)}\n`);
  } catch (error: unknown) {
    logApiError(error);
    throw error;
  }
}

interface IStartAnalysisArguments extends ICreateClientArguments {
  clientId: string;
  projectId: string;
  analysisId: string;
}

/**
 * @throws Error
 */
export async function startAnalysisScan({
  baseUri,
  apiKey,
  clientId,
  projectId,
  analysisId,
}: IStartAnalysisArguments): Promise<void> {
  const client = createClient({ baseUri, apiKey });

  const analysisScanApiUrl = `clients/${clientId}/projects/${projectId}/analysis/${analysisId}`;

  logger.log(`Start Analysis Scan - Request Url (PUT): ${analysisScanApiUrl}`);

  try {
    const response = await client.put(analysisScanApiUrl);

    logger.log(
      `Start Analysis Scan - Response Status: ${response.status} (${response.statusText})\n`
    );
    logger.logVerbose(`Start Analysis Scan - Response Body: ${JSON.stringify(response.data)}\n`);
  } catch (error: unknown) {
    logApiError(error);
    throw error;
  }
}

interface ICheckAnalysisScanStatusArguments extends ICreateClientArguments {
  reportStatusUrl: string;
}

enum AnalysisScanStatus {
  Unknown = "Unknown",
  Queued = "Queued",
  Manifest = "Manifest",
  LocatingDependencies = "LocatingDependencies",
  LoadingPackageDetails = "LoadingPackageDetails",
  LocatingVulnerabilities = "LocatingVulnerabilities",
  RunningGovernancePolicies = "RunningGovernancePolicies",
  Finished = "Finished",
  FailedWithViolations = "FailedWithViolations",
  FailedWithVulnerabilities = "FailedWithVulnerabilities",
  Error = "Error",
}

interface ICheckAnalysisScanStatusReturn {
  status: AnalysisScanStatus;
  analysisId: string;
  result: {
    reportUrl: string;
    vulnerabilities: number;
    violations: number;
  };
}

/**
 * @throws Error
 */
async function checkAnalysisScanStatus({
  apiKey,
  reportStatusUrl,
}: ICheckAnalysisScanStatusArguments): Promise<ICheckAnalysisScanStatusReturn> {
  const client = createClient({ apiKey });

  logger.log(`Check Analysis Scan Status - Request Url (GET): ${reportStatusUrl}`);

  try {
    const response = await client.get<ICheckAnalysisScanStatusReturn>(reportStatusUrl);

    logger.log(
      `Check Analysis Scan Status - Response Status: ${response.status} (${response.statusText})\n`
    );
    logger.logVerbose(
      `Check Analysis Scan Status - Response Body: ${JSON.stringify(response.data)}\n`
    );
    return response.data;
  } catch (error: unknown) {
    logApiError(error);
    throw error;
  }
}

interface IWaitForScanToFinishArguments {
  apiKey: string;
  reportStatusUrl: string;
}

/**
 * @throws Error
 */
export async function waitForScanToFinish({
  apiKey,
  reportStatusUrl,
}: IWaitForScanToFinishArguments): Promise<ICheckAnalysisScanStatusReturn> {
  const scan = await checkAnalysisScanStatus({
    apiKey,
    reportStatusUrl,
  });

  switch (scan.status) {
    case AnalysisScanStatus.Error:
      throw new Error("Scan failed.");
    case AnalysisScanStatus.FailedWithViolations:
    case AnalysisScanStatus.FailedWithVulnerabilities:
      throw new Error(
        `Scan failed with ${scan.result.vulnerabilities} vulnerabilities and ${scan.result.violations} violations.`
      );
    case AnalysisScanStatus.Finished:
      logger.log(
        `Scan completed with ${scan.result.vulnerabilities} vulnerabilities and ${scan.result.violations} violations.`
      );
      return scan;
  }

  logger.log(`Scan Status: ${scan.status}`);
  await delay(3_000);
  return await waitForScanToFinish({ apiKey, reportStatusUrl });
}
