import { Hero } from "@/components/Hero/Hero";
import { RiderSteps } from "@/components/RiderSteps/RiderSteps";
import { DriverSteps } from "@/components/DriverSteps/DriverSteps";
import { TrustSafety } from "@/components/TrustSafety/TrustSafety";


type Props = {
  params: Promise<{ lang: string }>;
};

export default async function Home({params}: Props) {
  const {lang} = await params;

  return (
    <div>
      <Hero lang={lang}/>
      <RiderSteps />
      <DriverSteps />
      <TrustSafety />
    </div>
  );
}
