import Nav from "@/components/Nav";
import Hero from "@/components/hero/Hero";
import Reveal from "@/components/Reveal";
import SmoothScroll from "@/components/SmoothScroll";
import Loader from "@/components/Loader";
import Shop from "@/components/sections/Shop";
import Material from "@/components/sections/Material";
import Sizes from "@/components/sections/Sizes";
import Range from "@/components/sections/Range";
import Contact from "@/components/sections/Contact";
import Footer from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Loader waitFor="scene" />
      <Reveal />
      <Nav />
      <main id="top">
        <Hero />
        <Shop />
        <Material />
        <Sizes />
        <Range />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
