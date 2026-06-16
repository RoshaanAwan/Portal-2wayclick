"use client";

import dynamic from "next/dynamic";

// The assistant is an enhancer, not part of first paint: a floating bottom-right
// chat that pulls in framer-motion and a streaming-chat client. Loading it via
// next/dynamic (ssr:false) keeps its JS off the initial bundle/hydration path of
// every page — it's fetched in the background after the page is interactive.
// This must live in a client component because ssr:false dynamic imports aren't
// allowed in server components (the app layout is a server component).
const AssistantWidget = dynamic(
  () => import("./AssistantWidget").then((m) => m.AssistantWidget),
  { ssr: false, loading: () => null },
);

export function AssistantWidgetLazy() {
  return <AssistantWidget />;
}
