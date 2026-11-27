"use client";

import Image, { type ImageLoaderProps, type ImageProps } from "next/image";

function loadPhoto({ src, width }: ImageLoaderProps) {
  return `${src}?w=${Math.min(width, 1920)}`;
}

export function RentHomePhoto({ alt, ...props }: Omit<ImageProps, "loader" | "unoptimized">) {
  return <Image {...props} alt={alt} loader={loadPhoto} />;
}
