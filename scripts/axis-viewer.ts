import { prepareDashboardViewer } from "../src/lib/axis/viewer-package";
const result = await prepareDashboardViewer();
console.log(`Prepared ${result.files} dashboard-only website files in ${result.directory}`);
