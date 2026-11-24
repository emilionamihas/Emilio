/** Sustituto de next/link: anclas con #nombre y navegación sin recargar. */
import { forwardRef } from "react";
import { hrefToHash, navigate } from "./navigation";

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; prefetch?: boolean };

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, onClick, prefetch: _prefetch, ...rest }, ref) {
  void _prefetch;
  return (
    <a
      ref={ref}
      href={hrefToHash(href)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
});

export default Link;
