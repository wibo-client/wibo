import { JsonUtils } from '../utils/jsonUtils.mjs';

export default class ReferenceHandler {
  constructor() {
    this.MAX_CONTENT_SIZE = 28720;
  }

  async init(globalContext) {
    this.globalContext = globalContext;
  }




}
