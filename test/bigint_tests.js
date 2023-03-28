import assert from "assert";
import {getCurveFromName} from "../src/curves.js";
import {Scalar} from "ffjavascript";

// async function readG1() {
//     const pBuff = await fd.read(curve.G1.F.n8*2);
//     return curve.G1.fromRprLEM( pBuff );
// }

// async function readG2() {
//     const pBuff = await fd.read(curve.G2.F.n8*2);
//     return curve.G2.fromRprLEM( pBuff );
// }

function bnToBuf(bn) {
    // eslint-disable-next-line no-undef
    var hex = BigInt(bn).toString(16);
    if (hex.length % 2) { hex = "0" + hex; }
  
    var len = hex.length / 2;
    var u8 = new Uint8Array(len);
  
    var i = 0;
    var j = 0;
    while (i < len) {
        u8[i] = parseInt(hex.slice(j, j+2), 16);
        i += 1;
        j += 2;
    }
  
    return u8;
}

describe("snarkjs: Test functions on bigint", function () {
    this.timeout(150000);

    let curve;
    let sFr;
    const g1Point = BigInt("10206942746448050477810040810960330180854804500791464218602135135690739158704");
    

    before(async () => {
        curve = await getCurveFromName("bn128");
        sFr = curve.Fr.n8;
    });

    after(async () => {
        await curve.terminate();
    });

    it("should convert correctly", async () => {

        let buffG1 = bnToBuf(g1Point);
        assert.equal(sFr, buffG1.length);

    });

    it("should handle serialise/deserialise", async () => {
        const g1Buff = curve.G1.timesScalar(curve.G1.one, Scalar.e("5"));
        assert.equal(sFr * 3, g1Buff.length);
        console.info("g1 * 5: " + curve.G1.toString(g1Buff, 16));

        const g1Affine = curve.G1.toAffine(g1Buff);
        assert.equal(sFr * 2, g1Affine.length);
        console.info("affine: " + curve.G1.toString(g1Affine, 16));

        const s = curve.Fr.toString(g1Affine, 10);
        console.info("g1 point as string: " + s);

        const b = bnToBuf(s);
        assert.equal(sFr, b.length);

        const uc = curve.G1.fromRprCompressed(b, 0);
        assert.equal(sFr * 2, uc.length);
        console.info("uc: " + curve.G1.toString(uc, 16));

        const j = curve.G1.toJacobian(uc);
        assert.equal(sFr * 3, j.length);
        console.info("jacobian: " + curve.G1.toString(j, 16));

        //assert.ok(curve.G1.eq(g1Affine, uc));
        let lemBuff = new Uint8Array(sFr*2);
        curve.G1.toRprLEM(lemBuff, 0, uc);
        console.info("lemBuff: " + curve.G1.toString(lemBuff, 16));
        assert.ok(curve.G1.eq(g1Affine, lemBuff));
    });

});