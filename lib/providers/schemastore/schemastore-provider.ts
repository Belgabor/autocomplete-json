import * as minimatch from 'minimatch';
import {IProposalProvider, IRequest, IProposal} from '../../provider-api'
import {JsonSchemaProposalProvider} from '../../json-schema-proposal-provider';
import {SchemaRoot} from '../../json-schema';
import {CompoundProposalProvider} from './compound-provider';
const fetch = require('node-fetch');

interface ISchemaInfo {
  name?: string,
  description?: string,
  fileMatch?: Array<string>,
  url?: string
}

export default class SchemaStoreProvider implements IProposalProvider {
  private schemaInfos: Array<ISchemaInfo>
  private compoundProvier = new CompoundProposalProvider();
  private blackList: { [email: string]: boolean } = {};

  getSchemaInfos(): Promise<ISchemaInfo[]> {
    if(this.schemaInfos) {
      return Promise.resolve(this.schemaInfos);
    }
    return fetch('http://schemastore.org/api/json/catalog.json')
      .then((response: any) => response.json())
      .then((data: any) => data.schemas.filter((schema: ISchemaInfo) => !!schema.fileMatch))
      .then((schemaInfos: Array<ISchemaInfo>) => {
        this.schemaInfos = schemaInfos
        return schemaInfos;
      });
  }

  getProposals(request: IRequest): Promise<Array<IProposal>> {
    const fileName: string = request.editor.buffer.file.getBaseName();
    if (this.blackList[fileName]) {
      console.warn('schemas not available');
      return Promise.resolve([]);
    }

    if(!this.compoundProvier.hasProposals(fileName)) {
      return this.getSchemaInfos()
        .then(schemaInfos => schemaInfos.filter(({fileMatch}) => fileMatch.some(match => minimatch(fileName, match))))
        .then(matching => Promise.all(
          matching.map(schemaInfo => fetch(schemaInfo.url)
            .then((result: any) => result.json()
            .then((schema: Object) => new JsonSchemaProposalProvider(
              schemaInfo.fileMatch,
              new SchemaRoot(schema)
            ))
          ) as Promise<IProposalProvider>)) as any // wont compile otherwise for some reason
        )
        .then((providers: IProposalProvider[]) => this.compoundProvier.addProviders(providers))
        .then(_ => {
          if(!this.compoundProvier.hasProposals(fileName)) {
            this.blackList[fileName] = true;
          }
        })
        .then(_ => this.compoundProvier.getProposals(request))
    }
    return this.compoundProvier.getProposals(request);
  }

  getFilePattern(): string {
    return '*';
  }
}
