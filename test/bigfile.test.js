/* eslint-disable linebreak-style */
import assert from "assert";
import * as binFileUtils from "@iden3/binfileutils";
import * as utils from "../src/powersoftau_utils.js";
import {BigBuffer} from "ffjavascript";

describe("Read a large file", function ()  {
    this.timeout(1000000000);

    it ("reads ptau file", async () => {
        const file = "//wsl.localhost/Ubuntu/home/geoff/ptau/pot10_0004_beacon.ptau";
        const p = 10; //29
        //"../data/pot28_beacon.ptau"
        const {fd: fdOld, sections} = await binFileUtils.readBinFile(file, "ptau", 1);
        const {curve} = await utils.readPTauHeader(fdOld, sections);
    
        const nPoints = 2 ** p;
        const G = curve["G1"];
        const sGin = G.F.n8*2;

        let buff;
        buff = new BigBuffer(nPoints*sGin);

        await binFileUtils.startReadUniqueSection(fdOld, sections, 2);
        await fdOld.readToBuffer(buff, 0,(nPoints-1)*sGin );
        await binFileUtils.endReadSection(fdOld, true);

        console.log(`successfully read ${buff.byteLength} bytes`);

        assert("done");
    });

});
