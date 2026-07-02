import type { ReactNode } from 'react';

import {
  affineLogo,
  arts,
  artsWrapper,
  hideInSmallScreen,
  root,
  topNav,
} from '@/styles/theme.css';

export function OtherPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className={root}>
      <div className={topNav}>
        <a href="/" className={affineLogo}>
          <MadocLogo />
          madoc
        </a>
        <div className={hideInSmallScreen} />
      </div>
      <SignInBackgroundArts />
      {children}
    </div>
  );
}

function MadocLogo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.5 3H15L12.5 10L10 3H7.5L5 10L2.5 3H0L5 17H7.5L10 10L12.5 17H15L17.5 3Z" fill="currentColor" />
    </svg>
  );
}

function SignInBackgroundArts() {
  return (
    <div className={artsWrapper}>
      <svg
        className={arts}
        width="1440"
        height="688"
        viewBox="0 0 1440 688"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g filter="url(#filter0)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M17.08 45C20.75 20.97 43.3 4.47 67.45 8.16C87.02 11.15 101.62 26.47 104.51 44.95C126.65 50.24 141.41 71.63 137.93 94.43C134.26 118.46 111.7 134.95 87.56 131.26L19.12 120.81C-0.83 117.77 -14.54 99.2 -11.51 79.35C-9.18 64.09 2.36 52.52 16.63 49.36C16.71 47.91 16.86 46.46 17.08 45Z"
            fill="#FFFFFF"
            opacity="0.8"
          />
        </g>
        <g filter="url(#filter1)">
          <path d="M32.74 506.18C30.12 497.78 34.7 488.57 42.97 485.6L122.81 456.93C131.09 453.96 139.92 458.35 142.55 466.74L155.13 506.95L45.32 546.39L32.74 506.18Z" fill="#FFFFFF" opacity="0.8" />
          <path d="M95.85 589.87L99.24 581.42L97.78 566.35L71.21 575.89C62.94 578.86 54.1 574.47 51.48 566.08L47.46 553.23L157.27 513.79L161.29 526.65C163.91 535.04 159.33 544.25 151.06 547.22L124.49 556.76L131.8 569.73L139.26 574.28L95.85 589.87Z" fill="#FFFFFF" opacity="0.8" />
        </g>
        <g filter="url(#filter2)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M1330.37 392.11C1311.04 386.41 1290.74 397.46 1285.04 416.79L1278.67 438.37L1270.9 436.08C1262.49 433.6 1253.66 438.4 1251.18 446.81L1235.49 500C1233.01 508.41 1237.81 517.23 1246.22 519.71L1331.79 544.96C1340.19 547.44 1349.02 542.64 1351.5 534.23L1367.19 481.04C1369.67 472.63 1364.87 463.81 1356.46 461.33L1348.68 459.03L1355.05 437.45C1360.76 418.11 1349.71 397.82 1330.37 392.11ZM1338.03 455.89L1344.39 434.3C1348.36 420.86 1340.68 406.74 1327.23 402.77C1313.78 398.81 1299.67 406.49 1295.7 419.94L1289.33 441.52L1338.03 455.89Z"
            fill="#FFFFFF"
            opacity="0.8"
          />
        </g>
        <defs>
          <filter id="filter0" x="-18" y="0.65" width="245" height="209" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feOffset dx="4" dy="3" />
            <feGaussianBlur stdDeviation="5" />
            <feColorMatrix values="0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0.1 0" />
          </filter>
          <filter id="filter1" x="24" y="448" width="240" height="240" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feOffset dx="4" dy="4" />
            <feGaussianBlur stdDeviation="6" />
            <feColorMatrix values="0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0.1 0" />
          </filter>
          <filter id="filter2" x="1227" y="384" width="222" height="256" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feOffset dx="3" dy="4" />
            <feGaussianBlur stdDeviation="5.5" />
            <feColorMatrix values="0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0 0.2 0 0 0 0.1 0" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
