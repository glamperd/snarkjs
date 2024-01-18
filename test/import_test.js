import assert from "assert";
import { getCurveFromName } from "../src/curves.js";
import { hex2ByteArray } from "../src/misc.js";


describe("import test", (done) => {
    let curve;

    before( async () => {
        curve = await getCurveFromName("bn128");
        done();
    });
    after( async () => {
        await curve.terminate();
        done();
    });

    it("It should convert tau^1_g1 ", async () => {
        const tau_1_g1_bytes = hex2ByteArray(
            "029f045ad8e131df1a10c4169e468fa69919a8d5ea1ded2ca26f87bcc7f96d"
        );

        const tau_1_g1 = curve.G1.fromRprCompressed(tau_1_g1_bytes);

        assert(true);
    });

});