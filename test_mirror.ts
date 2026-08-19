import { streamService } from "./src/lib/server/stream-service";

async function main() {
    try {
        const result = await streamService.getStream("one-piece-CTqWaizwOp3", 1, 1, false);
        console.log("SUCCESS");
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("ERROR", e);
    }
}

main();
