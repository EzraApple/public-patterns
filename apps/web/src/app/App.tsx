import { Lab } from "@/features/lab/Lab";
import { ArticlePage } from "@/features/articles/ArticlePage";
import { AboutPage } from "@/features/about/AboutPage";
import { HomePage } from "@/features/home/HomePage";

export function App() {
  const articleMatch = window.location.pathname.match(/^\/article\/([^/]+)\/?$/);

  if (articleMatch) {
    return <ArticlePage slug={articleMatch[1]} />;
  }

  if (window.location.pathname === "/_lab") {
    return <Lab />;
  }

  if (window.location.pathname === "/about") {
    return <AboutPage />;
  }

  return <HomePage />;
}
