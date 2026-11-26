import { Manrope } from "next/font/google";
import type { ReactNode } from "react";
import styles from "./storefront.module.css";

const manrope = Manrope({ subsets: ["latin"], display: "swap" });

export default function RentHomeLayout({ children }: { children: ReactNode }) {
  return <div lang="es-BO" className={`${manrope.className} ${styles.storefront}`}>{children}</div>;
}
