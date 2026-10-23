import { THEME_STORAGE_KEY } from "@/lib/theme";

// Applies your saved theme (or the system's) in <head>, before the page
// paints, so a dark page never flashes white first. A Server Component on
// purpose: React doesn't run scripts rendered by Client Components. Kept
// tiny and dependency-free, since it's a string run as is.
const APPLY_THEME = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />;
}
