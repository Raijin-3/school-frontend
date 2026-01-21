import { PageLoader } from "@/components/ui/page-loader";

export default function Loading() {
  return (
    <PageLoader
      overlay
      overlayClassName="bg-black/15 backdrop-blur"
      fullScreen
      className="max-w-md rounded-2xl bg-white/80 shadow-xl"
      message="Preparing your personalized Jarvis journey..."
      description="Hang tight while we set things up for you."
    />
  );
}
