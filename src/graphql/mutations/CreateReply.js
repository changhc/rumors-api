import { GraphQLString, GraphQLNonNull } from 'graphql';

import { assertUser } from 'graphql/util';

import client from 'util/client';
import scrapUrls from 'util/scrapUrls';

import ReplyTypeEnum from 'graphql/models/ReplyTypeEnum';
import MutationResult from 'graphql/models/MutationResult';
import { createArticleReply } from './CreateArticleReply';

/**
 * @param {string} replyId
 * @param {ScrapResult[]} hyperlinks
 * @return {Promise | null} update result
 */
export function updateReplyHyperlinks(replyId, scrapResults) {
  if (!scrapResults || scrapResults.length === 0) return Promise.resolve();

  return client.update({
    index: 'replies',
    type: 'doc',
    id: replyId,
    body: {
      doc: {
        hyperlinks: scrapResults.map(
          ({ url, normalizedUrl, title, summary }) => ({
            url,
            normalizedUrl,
            title,
            summary,
          })
        ),
      },
    },
  });
}

export default {
  type: MutationResult,
  description: 'Create a reply that replies to the specified article.',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
    text: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(ReplyTypeEnum) },
    reference: { type: GraphQLString },
  },
  async resolve(
    rootValue,
    { articleId, text, type, reference },
    { userId, appId, loaders }
  ) {
    assertUser({ userId, appId });

    if (type !== 'NOT_ARTICLE' && !reference) {
      throw new Error('reference is required for type !== NOT_ARTICLE');
    }

    const articlePromise = loaders.docLoader.load({
      index: 'articles',
      id: articleId,
    });

    const replyBody = {
      userId,
      appId,
      type,
      text,
      reference,
      createdAt: new Date(),
    };

    const newReplyPromise = client
      .index({
        index: 'replies',
        type: 'doc',
        body: replyBody,
      })
      .then(({ result, _id }) => {
        if (result !== 'created') {
          throw new Error(`Cannot create reply: ${result}`);
        }

        return _id;
      });

    const scrapPromise = scrapUrls(`${text} ${reference}`, {
      cacheLoader: loaders.urlLoader,
      client,
    });

    // Dependencies
    //
    // articlePromise -.
    // newReplyPromise -`-> articleReplyPromise -.
    //                \                           >-> done
    // scrapPromise ---`--> hyperlinkPromise ----'
    //

    const articleReplyPromise = Promise.all([
      articlePromise,
      newReplyPromise,
    ]).then(([article, id]) =>
      createArticleReply({
        article,
        reply: { ...replyBody, id },
        userId,
        appId,
      })
    );

    const hyperlinkPromise = Promise.all([newReplyPromise, scrapPromise]).then(
      ([replyId, scrapResults]) => updateReplyHyperlinks(replyId, scrapResults)
    );

    // Wait for all promises
    return Promise.all([
      newReplyPromise, // for fetching articleId
      articleReplyPromise,
      hyperlinkPromise,
    ]).then(([id]) => ({ id }));
  },
};
