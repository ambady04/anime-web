import { streamService } from "./src/lib/server/stream-service";
import fs from "fs";

async function main() {
    try {
        const result = await streamService.getStream("one-piece-CTqWaizwOp3", 1, 1, false);
        fs.writeFileSync("final_out.json", JSON.stringify(result, null, 2));
    } catch (e) {
        fs.writeFileSync("final_out.json", JSON.stringify({ error: e.message }));
    }
}

main();
