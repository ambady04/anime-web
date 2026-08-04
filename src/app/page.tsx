import { movieApi } from "@/lib/api";
import HomeClient from "@/components/home-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
    let homeData = null;

    try {
        homeData = await movieApi.getHome(false);
    } catch {
        // Fallback handled by HomeClient
    }

    return <HomeClient initialHomeData={homeData} />;
}
