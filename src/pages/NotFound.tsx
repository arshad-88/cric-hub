import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4 py-20 text-center"
      >
        <p className="score-nums text-7xl font-black text-[#22c55e] led-green sm:text-8xl">
          404
        </p>
        <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
          That delivery missed the bat
        </h1>
        <p className="mt-2 max-w-md text-xs uppercase tracking-widest text-slate-500">
          The page you're after doesn't exist — head back to the scoreboard.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 bg-[#22c55e] px-5 py-3 text-xs font-black uppercase tracking-widest text-[#052e16] transition-colors hover:bg-[#facc15] hover:text-[#422006]"
        >
          <ArrowLeft className="size-4" /> Back to live scores
        </Link>
      </motion.main>
      <SiteFooter />
    </div>
  );
}
