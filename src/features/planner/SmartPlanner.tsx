import React from 'react';
import {useMembership} from '@/src/features/pro/MembershipContext';
import {SmartPlanner as FreeSmartPlanner} from './FreeSmartPlanner';
import {SmartPlanner as ProSmartPlanner} from './ProSmartPlanner';
export const SmartPlanner=(props:React.ComponentProps<typeof FreeSmartPlanner>)=>useMembership().cinematic?<ProSmartPlanner {...props}/>:<FreeSmartPlanner {...props}/>;
