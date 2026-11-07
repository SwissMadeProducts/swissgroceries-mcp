import { defineRailway, github, project, service } from 'railway/iac';
export default defineRailway(()=>{
  const groceries=service('swissgroceries-mcp',{
    source:github('SwissMadeProducts/swissgroceries-mcp',{branch:'master'}),
    build:{builder:'DOCKERFILE',dockerfilePath:'Dockerfile'},
    env:{PORT:'3000',SWISSGROCERIES_LOG_LEVEL:'silent'},
    healthcheck:'/health',healthcheckTimeout:60,
    deploy:{restartPolicyType:'ON_FAILURE',restartPolicyMaxRetries:3},
  });
  return project('swissgroceries-mcp',{resources:[groceries]});
});
