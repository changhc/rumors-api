import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateArticleReply';

describe('CreateArticleReply', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('connects article and reply together', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createArticleReply1';
    const replyId = 'createArticleReply2';

    const { data, errors } = await gql`
      mutation($articleId: String!, $replyId: String!) {
        CreateArticleReply(articleId: $articleId, replyId: $replyId) {
          positiveFeedbackCount
          negativeFeedbackCount
          user {
            id
          }
          status
          article {
            id
          }
          reply {
            id
          }
        }
      }
    `(
      {
        articleId,
        replyId,
      },
      { userId: 'test', appId: 'test' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data.CreateArticleReply).toMatchSnapshot();

    const { _source } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(_source).toMatchSnapshot();

    await resetFrom(fixtures, '/articles/doc/createArticleReply1');
  });

  it('cannot connect the same article and reply twice', async () => {
    const articleId = 'createArticleReply1';
    const replyId = 'createArticleReply2';

    await gql`
      mutation($articleId: String!, $replyId: String!) {
        CreateArticleReply(articleId: $articleId, replyId: $replyId) {
          replyId
        }
      }
    `({ articleId, replyId }, { userId: 'test', appId: 'test' });

    const { errors } = await gql`
      mutation($articleId: String!, $replyId: String!) {
        CreateArticleReply(articleId: $articleId, replyId: $replyId) {
          replyId
        }
      }
    `({ articleId, replyId }, { userId: 'anotherUser', appId: 'test' });

    expect('' + errors[0]).toMatch(/Cannot add articleReply/);

    // Cleanup
    await resetFrom(fixtures, '/articles/doc/createArticleReply1');
  });

  afterAll(() => unloadFixtures(fixtures));
});
