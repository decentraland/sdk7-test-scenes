// Gallery station: Backtracking policy, a failed plan leaves no partial result.
import { backtrackingPolicyDomain } from '../generated/backtracking_policy.htn'
import { GalleryStation } from '../stations'

export const policyStation: GalleryStation = {
  id: 'policy',
  title: 'Backtracking policy',
  blurb: 'a failed plan leaves no partial result',
  domain: backtrackingPolicyDomain,
  scenarios: [
    { name: 'run', method: 'run', setup: () => {}, expect: ['!step "one"', '!step "two"', '!step "three"'] },
    { name: 'run_small', method: 'run_small', setup: () => {}, expect: ['!step "small-one"', '!step "small-two"'] },
    { name: 'always_fail (no plan)', method: 'always_fail', setup: () => {}, expect: [] }
  ]
}
