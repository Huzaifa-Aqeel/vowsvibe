import type { ImgHTMLAttributes } from "react";
export default function Image({ priority: _priority, src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  if (src === "/logo.png") return <span className={props.className} aria-label={props.alt}>Vows & Vibe</span>;
  return <img {...props} src={src}/>;
}
