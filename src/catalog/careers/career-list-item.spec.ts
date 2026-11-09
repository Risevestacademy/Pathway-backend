import { toCareerListItem } from './career-list-item';

describe('toCareerListItem', () => {
  it('maps description to shortDescription', () => {
    expect(
      toCareerListItem({
        id: 'career-1',
        slug: 'frontend-engineer',
        title: 'Frontend Engineer',
        description: 'Builds interfaces.',
      }),
    ).toEqual({
      id: 'career-1',
      slug: 'frontend-engineer',
      title: 'Frontend Engineer',
      shortDescription: 'Builds interfaces.',
    });
  });
});
