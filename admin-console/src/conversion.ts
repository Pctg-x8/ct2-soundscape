import { License } from "soundscape-shared/src/valueObjects/license";

export function convertLicenseInput(x: { readonly licenseType: number; readonly licenseText: string }): License.Type {
    switch (x.licenseType) {
        case License.PublicDomain:
        case License.CreativeCommons4.BY:
        case License.CreativeCommons4.BY_SA:
        case License.CreativeCommons4.BY_NC:
        case License.CreativeCommons4.BY_ND:
        case License.CreativeCommons4.BY_NC_SA:
        case License.CreativeCommons4.BY_NC_ND:
            return x.licenseType;
        case 999:
            return x.licenseText;
        default:
            throw new Error(`invalid license input: ${x.licenseType} ${x.licenseText}`);
    }
}
