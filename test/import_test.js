import assert from "assert";
import { getCurveFromName } from "../src/curves.js";
import { hex2ByteArray, byteArray2hex } from "../src/misc.js";
import {BigBuffer} from "ffjavascript";

describe("import test", () => {
    //this.slow(10000);
    let curve;

    before( async () => {
        curve = await getCurveFromName("bn128");
    });
    after( () => {
        curve.terminate();
    });

    it("It should convert tau^1_g1 ", async () => {
        console.log("tau_1_g1 test");
        const tau_1_g1_bytes = hex2ByteArray(
            "0x029f045ad8e131df1a10c4169e468fa69919a8d5ea1ded2ca26f87bcc77cf96d"
        );
        console.log(`tau_1 bytes ${tau_1_g1_bytes.length}`);
        const tau_0_g1_u_bytes = hex2ByteArray(
            //"149b8e550e4be15ae9857ee65b3bcda2ebbda53c73285b28461e16b48f507e8e256774e44fe69bc49cf2a4bc0b373f659656dcce99ba27bd1a8259d95b5b8593"
            "9d0d8fc58d435dd33d0bc7f528eb780a2c4679786fa36e662fdf079ac1770a0e3a1b1e8b1b87baa67b168eeb51d6f114588cf2f0de46ddcc5ebe0f3483ef141c" +
            "2bce492d8c85177ed102264e38f809cd29884949d8015ffdaf4b83791184080138a2f59ade0bcee6b415df5dd12dffeb259c35c4267f196676dc73ffc2be842a" +
            "bf293e3273a0f584c4b989f25f0bde4d1a84031cc65ea68d0bf1b33b2393fa0ddce00707ef89c04486d627bf5f571a827d31968077a036429b3a17f680f4fb02" +
            "7ac3e2cc584366025f0d775d12b845416814d406e01fc7065a631f25287c091d4d307fa91f2ed9a9fb67f8097c14e46cbd8a1ae4815e4295229bdd1f5730dc2c" //+
            // "45fc15fb72b69e8a3ee489ea45aa95320f456255fd05440cc778075a063fca2de27f04448acbe8f4b491564512beba384b912b4446072a2dfef8f0584a28a61c" +
            // "02b6e414d3d173a68fa8d3cca9801884d269e56044ca253918eaec076f67f41ea1a046dbe7d46cf05ee11c32dd4bb2404d8f266fcc2f8252a648ffb44b8f2a27" +
            // "ba16fa207c07d8f8dfed7746a4c00106f5a96e13304fbf4edcb7c4059f32e32638ded1e907dc8ce976c5a8ec8ef6e1e09dbe9e6c960b2b21dbc37a419c06660d" +
            // "dd03347965cf335ceae78617516d28b469ad2a8d343c6fac674d923c8a4c1b0e9342302ee2e68398c0b7dc30fffdc893dcad888be8fb66c997695c617468e409" +
            // "07bd9af48c86b896fa56d1043ba4a29d716270cb64932d675a2b703d64398a2fa55126bb9f4e114d3acc76439c2f97e90b594fb6010a3269352a45c8b636671e" +
            // "856f81e7ba7cf4fc2ff79a6a18f4bcd21d80749628a0609c471b191043fa7619eef76ce479be0b4040096bd8491e3d81f55cf857f6ee4a4c387257c30cc9370b" +
            // "f7e97b2c2753332337870b20e428a3259f9dd4928109eb87a6caad9e75a7b31f79aa924e8191dbbd653d07884358ce7e29d4d468a6e48ec89767581725b81718" +
            // "9d2c4e85da836e8ab5cca7901cada8baf898dd83deffd7a11c61d96799872a1b073d76b630f9c03277972ef6d26ebdbd1fd7997cc5bcdd9dee8a1c3abe0a7a27" +
            // "f811374e3b3617b7a9fb39a0bf8e1ff1b02640133dac675bc7176e204d89970f7e427fe7c3049ed1c1d31f9d5925df998bc3f4afeb9675a9274a4596a0cdc914" +
            // "5bfbc707330bd825dd8482eaeb9d20a1bf7c33dfbe0a8d5e2c208ca6d09f3e10309f09946cdbeba770c4f63a6d524c3df8cd240ed93ffec69cdfd2b9b42fd11e" +
            // "59ca7893894e5f4f14add06e3c08c4f3548380b605ba8d57caba1bfe4cc3a81da37dbbdf5529069155a728ea7025723318bd5fd6244059461ebae79c2391cb2d"
        );

        const tau_1_g1 = await curve.G1.fromRprCompressed(tau_1_g1_bytes, 0);
        console.log("point: " + await curve.G1.toString(tau_1_g1, 16));

        const uncomp = await curve.G1.toUncompressed(tau_1_g1);

        console.log(`uncompressed ${byteArray2hex(uncomp)}`);

        const uncompressed_bytes = await curve.G1.batchCtoLEM(tau_1_g1_bytes);

        console.log(`batch uncomp ${byteArray2hex(uncompressed_bytes)}`);

        let buff = new BigBuffer(256);
        buff.set(tau_0_g1_u_bytes, 0);
        //buff.set(curve.G1.zeroAffine, 960);
        
        buff = await curve.G1.lagrangeEvaluations(buff, "affine", "affine", console, "tauG1");

        const lagrange = byteArray2hex(buff);
        console.log(`lagrange ${lagrange}`);

        const tau_0 = await curve.G1.batchUtoLEM(tau_0_g1_u_bytes);
        console.log(`tau_0 LEM ${byteArray2hex(tau_0)}`);

        assert(true);
    });

});