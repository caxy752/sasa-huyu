/**
 * Shim for @deriv/quill-icons/Illustration
 *
 * The installed version of @deriv/quill-icons does not include an "Illustration"
 * sub-path. This shim maps every DerivLight* icon used across the app to the
 * closest available icon in the installed package so the build succeeds without
 * modifying individual component files.
 *
 * If you upgrade @deriv/quill-icons to a version that restores the Illustration
 * path, remove the alias in rsbuild.config.ts and delete this file.
 */

export { IllustrativeComputerIcon   as DerivLightMyComputerIcon   } from '@deriv/quill-icons/Illustrative';
export { IllustrativeComputerIcon   as DerivLightLocalDeviceIcon   } from '@deriv/quill-icons/Illustrative';
export { IllustrativeCriticalIcon   as DerivLightUserErrorIcon     } from '@deriv/quill-icons/Illustrative';
export { IllustrativeListIcon       as DerivLightEmptyCardboardBoxIcon } from '@deriv/quill-icons/Illustrative';
export { IllustrativePlatformsIcon  as DerivLightBotBuilderIcon    } from '@deriv/quill-icons/Illustrative';
export { IllustrativeOptionsIcon    as DerivLightQuickStrategyIcon } from '@deriv/quill-icons/Illustrative';
export { IllustrativeMobileIcon     as DerivLightGoogleDriveIcon   } from '@deriv/quill-icons/Illustrative';
export { IllustrativeCriticalIcon   as DerivLightDeclinedPoaIcon   } from '@deriv/quill-icons/Illustrative';
